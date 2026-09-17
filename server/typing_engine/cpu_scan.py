"""CPU cost of N concurrent typing tabs, now that type_text takes focus itself.

Typing is mostly WAITING (each key is followed by a sleep), so the question is
not whether N tabs saturate the cores, but whether any tab gets STARVED — which
would stretch its gaps and corrupt the timing measurement. So this reports the
spread between tabs, not just the mean.
"""
import asyncio, json, os, pathlib, sys, time, statistics as st, subprocess
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import direct_type as dt
import websockets

def cpu():
    out = subprocess.run(['ps','-eo','%cpu,cmd'], capture_output=True, text=True).stdout
    tot=0.0; rend=0.0
    for line in out.splitlines():
        if 'chrome' not in line: continue
        try: c=float(line.split(None,1)[0])
        except Exception: continue
        tot+=c
        if '--type=renderer' in line: rend+=c
    return tot, rend

def mem():
    for l in open('/proc/meminfo'):
        if l.startswith('MemAvailable'): return int(l.split()[1])/1024

def load(): return open('/proc/loadavg').read().split()[:3]

TEXT = ("The printing press changed what a book was and what a reader could hold. ")

async def one(tab):
    cap = dt.Capture(tab); cap.start()
    cfg = {"typo_rate": 0.0, "cursor": {"enabled": False}}
    prof = dict(dt.HUMAN_PARAMS); prof["think_gap_prob"]=0.0
    t0=time.time()
    await dt.type_text(tab, TEXT, prof, cfg, cap=cap)
    el=time.time()-t0
    ks=[e["t"] for e in cap.events if e["kind"]=="keyDown"]
    g=sorted((b-a)*1000 for a,b in zip(ks,ks[1:]))
    if not g: return None
    return {"el":el,"median":st.median(g),"mean":st.mean(g)}

async def run(N):
    ver = dt.http_json("/json/version")
    made=[]
    async with websockets.connect(ver["webSocketDebuggerUrl"], max_size=64*1024*1024) as ws:
        br = dt.Browser(ws); await br.start()
        wid=(await br.call("Browser.getWindowForTarget",{"targetId":None})).get("result",{}).get("windowId")
        for _ in range(N):
            rr=await br.call("Target.createTarget",{"url":"https://docs.new","newWindow":False,"windowId":wid})
            made.append(rr["result"]["targetId"])
        tabs=[]
        for tid in made:
            try:
                t=dt.Tab(br, await br.ws_for(tid)); await dt.wait_ready(t,timeout=90); tabs.append(t)
            except Exception: pass
        c0,r0=cpu()
        t0=time.time()
        res=await asyncio.gather(*[one(t) for t in tabs])
        wall=time.time()-t0
        c1,r1=cpu()
        ok=[r for r in res if r]
        meds=[r['median'] for r in ok]
        print(f"  N={N:>2}  tabs={len(tabs):>2}  wall={wall:5.1f}s  "
              f"chromeCPU={c1:6.1f}%  renderers~{r1:6.1f}%  "
              f"median={st.mean(meds):5.0f}ms  spread={max(meds)-min(meds):4.0f}ms  "
              f"mem={mem():5.0f}MB  load={load()[0]}")
        for tid in made:
            try: await br.close_tab(tid)
            except Exception: pass
        await asyncio.sleep(4)
    return meds

async def main():
    print(f"  cores={subprocess.run(['nproc'],capture_output=True,text=True).stdout.strip()}  "
          f"load before={load()}  mem={mem():.0f}MB\n")
    print("    N  tabs   wall   chromeCPU  renderers   median  spread   mem    load")
    for N in (20, 15, 12, 10, 8, 5):
        await run(N)
    print(f"\n  load after={load()}")
    return 0

sys.exit(asyncio.run(main()))
