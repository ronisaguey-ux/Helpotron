import pathlib
import asyncio, json, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import direct_type as dt
import websockets

async def main():
    ver = dt.http_json("/json/version")
    async with websockets.connect(ver["webSocketDebuggerUrl"], max_size=64*1024*1024) as ws:
        br = dt.Browser(ws); await br.start()
        tid = await br.new_tab("https://docs.new")
        await asyncio.sleep(5)
        tab = dt.Tab(br, await br.ws_for(tid))
        await dt.wait_ready(tab, timeout=45)
        await dt.focus_editor(tab)
        for ch in "Hello world":
            p = dt.key_payload(ch)
            await tab.call("Input.dispatchKeyEvent", p["down"])
            await tab.call("Input.dispatchKeyEvent", p["up"])
            await asyncio.sleep(0.12)
        await asyncio.sleep(1.5)
        r = await tab.js("""(() => {
          const out = [];
          const seen = new Set();
          const probe = (sel) => {
            try {
              const els = document.querySelectorAll(sel);
              if (els.length) {
                const t = els[0].textContent || '';
                out.push({sel, n: els.length, len: t.length, head: t.slice(0,40)});
              }
            } catch(e) {}
          };
          ['.kix-lineview-text', '.kix-canvas-tile-content', '.kix-wordhtmlgenerator-word-node',
           '.kix-paragraphrenderer', '[role="textbox"]', '.kix-appview-editor',
           '.docs-texteventtarget-iframe', '.kix-page-content-wrapper'].forEach(probe);
          // any element whose text contains our typed text
          const all = document.querySelectorAll('*');
          let best = null;
          for (const el of all) {
            if (el.children.length > 3) continue;
            const t = (el.textContent||'');
            if (t.includes('Hello world') && (!best || t.length < best.len)) {
              best = {tag: el.tagName, cls: el.className, len: t.length, head: t.slice(0,50)};
            }
          }
          return {selectors: out, containsTyped: best};
        })()""")
        print(json.dumps(r, indent=1)[:1400])
        try: await br.call("Target.detachFromTarget", {"sessionId": tab.sid})
        except Exception: pass
        await br.close_tab(tid)
    return 0

sys.exit(asyncio.run(main()))
