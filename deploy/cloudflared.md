# Cloudflare Tunnel — public exposure (no VPS)

helpotron serves on 127.0.0.1:8000 (API) + :5173 (web). The ONLY public ingress
is the Cloudflare Tunnel; the laptop never exposes a raw IP.

## Once (install if missing)
```
# apt: cloudflared (or download the releas binary from pkg.cloudflare.com)
cloudflared tunnel login
cloudflared tunnel create helpotron        # emits a tunnel id (UUID)
cloudflared config get helpotron            # verify
```

## Config (~/.cloudflared/config.yml)
```yaml
tunnel: <tunnel-id>
credentials-file: /home/roni/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: helpotron.yourdomain.com
    service: http://localhost:8000
    # hostname: helpotron.dev.yourdomain.com -> service: http://localhost:5173  (dev)
  - service: http_status:404
```

Route the hostname (one-time):
```
cloudflared tunnel route dns helpotron helpotron.yourdomain.com
```
(Or do it in the Zero Trust dashboard → Tunnels → Public Hostnames.)

## Run (/usr/bin/systemd user unit or simple)
```
cloudflared tunnel run helpotron
```
For a persistent unit:
```
systemctl --user enable --now cloudflared  # after placing a unit
# Unit: ExecStart=/usr/bin/cloudflared tunnel run helpotron
```

## Check
```
cloudflared tunnel info helpotron
curl -s https://helpotron.yourdomain.com/health
```

## Afterwork
- Tunnel bounds egress; main (admin agent) talks to the API on localhost —
  never through the tunnel — so nothing can MITM main's control path.
- Restart the tunnel after `run_native.sh` restarts the API (tunnel → localhost
  is reconnective; a brief 502 during restart is expected).
