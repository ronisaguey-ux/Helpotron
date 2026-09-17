"""Read Google Docs' own changelog — the data the grader actually grades from.

the grader's score is computed server-side from the Docs revision changelog, not
from raw key events. The extension fetches it (GET_CHANGELOG) and posts it to
/v3/scan/{id}/unified-detection. We can fetch and decode the same changelog
locally, which turns the owner's screenshot loop into a self-check: every
variation can report what a detector would see before anyone grades it.

The one rule worth checking automatically is the paste rule, which is exact:
    isPaste = !nativeSource && !isGemini && insertedLength > 112
so any single insert longer than 112 characters is flagged as a paste.
"""
import asyncio, json

META_JS = """(() => {
  const m = document.location.href.match(/\\/document\\/d\\/([^\\/]+)/);
  const d = window._docs_flag_initialData || {};
  return JSON.stringify({
    docid: m && m[1],
    token: (d.info_params && d.info_params.token) || null,
    prefix: 'https://docs.google.com/document/u/0/d'
  });
})()"""

CHANGELOG_JS = """async (docid, token, prefix) => {
  const xget = (u) => new Promise((res) => { const x = new XMLHttpRequest();
    x.open('GET', u, true); x.onreadystatechange = () => { if (x.readyState===4)
      res(String(x.responseText||'')); }; x.onerror=()=>res(''); x.send(); });
  const strip = (s) => { let t = s.startsWith(")]}'") ? s.slice(4) : s;
                         return t.startsWith("\\n") ? t.slice(1) : t; };
  const tiles = await xget(prefix+'/'+docid+'/revisions/tiles?id='+docid+
    '&start=1&showDetailedRevisions=false&loadType=0&token='+encodeURIComponent(token)+
    '&includes_info_params=true&cros_files=false');
  let total = 0;
  try { const j = JSON.parse(strip(tiles));
    for (const ti of (j.tileInfo||[])) if (ti.end>total) total=ti.end; } catch(e){}
  if (!total) return JSON.stringify({total:0, load:''});
  const load = await xget(prefix+'/'+docid+'/revisions/load?id='+docid+
    '&start=1&end='+total+'&token='+encodeURIComponent(token));
  return JSON.stringify({total, load: strip(load)});
}"""

PASTE_THRESHOLD = 112


async def read_changelog(tab):
    """Return the raw changelog for the document open in `tab`."""
    meta = json.loads(await tab.js(META_JS, timeout=30) or "{}")
    docid, token, prefix = meta.get("docid"), meta.get("token"), meta.get("prefix")
    if not (docid and token and prefix):
        return {"ok": False, "reason": "no docid/token",
                "docid": docid, "total": 0, "inserts": []}
    blob = await tab.js(
        f"({CHANGELOG_JS})({json.dumps(docid)}, {json.dumps(token)}, {json.dumps(prefix)})",
        await_promise=True, timeout=90)
    try:
        cj = json.loads(blob or "{}")
    except Exception:
        return {"ok": False, "reason": "changelog fetch failed", "docid": docid,
                "total": 0, "inserts": []}

    inserts, deletes, ops = [], [], {}
    body = cj.get("load") or ""
    if body:
        try:
            def walk(o):
                if isinstance(o, list):
                    for x in o:
                        walk(x)
                elif isinstance(o, dict):
                    for k, v in o.items():
                        if k == "ty" and isinstance(v, str):
                            ops[v] = ops.get(v, 0) + 1
                            if v in ("is", "iss"):
                                s = o.get("s") if isinstance(o.get("s"), str) else ""
                                inserts.append({"len": len(s),
                                                "text": s[:40],
                                                "rev": o.get("ibi")})
                            elif v in ("ds", "dss"):
                                deletes.append(o.get("s") if isinstance(o.get("s"), str) else "")
                        walk(v)
            walk(json.loads(body))
        except Exception as e:
            return {"ok": False, "reason": f"decode: {e}", "docid": docid,
                    "total": cj.get("total"), "inserts": []}

    lens = sorted(i["len"] for i in inserts)
    over = [i for i in inserts if i["len"] > PASTE_THRESHOLD]
    return {
        "ok": True, "docid": docid, "total": cj.get("total"),
        "ops": ops,
        "insert_count": len(inserts),
        "delete_count": len(deletes),
        "insert_lengths": lens,
        "max_insert": max(lens) if lens else 0,
        "inserts_over_paste_threshold": len(over),
        "paste_flagged": bool(over),
        "coalesced_2plus": sum(1 for i in inserts if i["len"] > 1),
        "inserts": inserts[:400],
    }
