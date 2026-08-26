# native-laptop deployment (08-26 operator directive)

The operator decided helpotron will NOT go to a VPS. It runs and launches
DIRECTLY from this laptop and is exposed through a Cloudflare Tunnel — no
vps/domain middleware in front of us↔website.

## Layout (all user data local & repo-contained)
```
data/db/         helpotron.db        (SQLite via DATABASE_URL)
data/lake/       data-lake entries   (DATA_LAKE_DIR)
data/uploads/    user files          (AGENT_FILES_DIR)
data/users/      user data snapshots (extension/assignments derived state)
data/assignments/ assignment workbases
data/state/      process/version state markers
data/sandboxes/  subagent sandboxes  (one temp workdir per subagent run)
```
The server defaults stay; run_native.sh points the above env vars here.

## Run
```
./deploy/run_native.sh        # API :8000 + web :5173, all data in data/
```

## Cloudflare Tunnel (public exposure)
- `cloudflared tunnel login` (once)
- `cloudflared tunnel create helpotron`
- point the tunnel to http://localhost:8000 (ingress config), then:
  `cloudflared tunnel run helpotron`
- Bind the generated hostname in Cloudflare Zero Trust (public hostname tab).
No VPS, no own IP exposure; the tunnel is the only ingress.

## OP = main (admin control agent)
main holds direct always-on access: admin token env (ADMIN_TOKEN / OCULUS_API_TOKEN
style) + full API/admin endpoints against 127.0.0.1:8000. Nothing between main
and the instance except localhost.

## Daily feedback loop (once live)
1. `./deploy/daily_feedback.sh` → collect latest data/lake entries (export), 
2. main evaluates them,
3. code updates ship to web + extension,
4. rebuild (`cd web && npm run build` or `npm run dev` hot reload),
5. reload extension (`web/scripts/ht_reload_extension.sh` helper) + restart API.
Keep it one command — see daily_feedback.sh next to this README.

## Subagent sandboxing
Every subagent run performs work inside `data/sandboxes/<run-id>/` — an
isolated temp workdir. Sandbox agents must never write outside their sandbox
path or the repo checkout; resource caps per run; cleanup after run.

## Prototype status
payments are NOT available — prototype only, free test run (banner in the UI;
no stripe hooks yet). Stripe arrives later.
