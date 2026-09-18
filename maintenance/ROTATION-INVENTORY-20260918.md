# ROTATION INVENTORY — helpotron + T2B
**Compiled 2026-09-18.** Driver: helpotron pentest finding **INJ-01** (Shannon, CRITICAL) —
`sympy.sympify` RCE in the `run_shell` agent action (`server/overlord_agent.py:398-499`).

## Why everything in this list must be treated as compromised

The AST allowlist inspected only Name/Attribute/Import/Call nodes and **never string
constants**, while `sympy` was on the allowed-module list and `sympify()` evaluates its
argument. Python hidden in a string literal bypassed every guard.

The exploit executed as the **service account**, whose group membership the pentest
captured verbatim:

```
uid=1000([SERVICE_ACCOUNT]) groups=1000,4(adm),24(cdrom),27(sudo),30(dip),
46(plugdev),100(users),114(lpadmin),125(docker)
```

**`sudo` AND `docker` both present.** Docker group alone is effectively root. So the blast
radius is not "the web app" — it is the whole box, including any credential readable by
that account anywhere on disk.

The report records the exploit reading all three env files and returning real values
(redacted in the report text, but captured by the model at runtime):

| file | contents returned |
|---|---|
| `server/.env` | JWT_SECRET, SECRET_KEY, SESSION_SECRET, OPENROUTER_API_KEY, TWILIO_*, CAPTCHA_BYPASS_SECRET |
| `.env` | DEV_LOGIN_PUBLIC_ID, DEV_LOGIN_PASSWORD, TWILIO_VERIFY_SERVICE_SID |
| `mcp/.env` | HELPOTRON_ADMIN_PUBLIC_ID, HELPOTRON_ADMIN_PASSWORD |

Also `id` (proving code execution, not computation) and `/etc/passwd` in full.

**Verified 2026-09-18: nothing had been rotated.** No `.env` file had an mtime after the
pentest window — `find . -name ".env*" -newermt "2026-09-18 03:00"` returned empty.

## ⚠️ WHERE THE EXPOSURE ACTUALLY CAME FROM — read this before treating it as urgent

**The secrets were never publicly exposed, and they are not on disk in plaintext.**

- The pentest's own report redacts them: `[REDACTED]`. A strict credential sweep across the
  whole Shannon workspace (`sk-or-v1-{32,}`, `sk-ant-api*`, `ghp_{36}`, `AC[a-f0-9]{32}`,
  `SK[a-f0-9]{32}`) returns **0 full-length real credentials**. The earlier "raw value on disk"
  hit was a loose regex matching the literal strings `AC` and the `sk-or-v1` prefix.
- The only leak vector that is real is **outbound**: the exploit's stdout became *model
  context*, and the pentest ran on the DeepSeek API — so the values were transmitted to a
  third party (DeepSeek's inference endpoint) as part of the run. That is a genuine reason to
  rotate, but it is not a public breach.
- The trigger for rotating is therefore: *the values were seen by a third party and the
  exploit proved root-equivalent access* — not *the values are readable by an attacker now*.

**A second, older leak of the same class exists locally and is NOT from the pentest:**
`data/sandboxes/20260903203639_shell_734077/logs/run.log` (Sep 3) contains a plaintext
`CAPTCHA_BYPASS_SECRET=` value and a full-format OpenRouter key on one line, from an earlier
security test that printed what it read. It is **untracked and gitignored** (`data/sandboxes/`
at `.gitignore:48`), never committed, and its values are **stale** — hash-compared against the
live `.env`, both differ. Confirmed not ongoing: of 1,853 sandbox `run.log`s newer than 09-05,
**0** contain a key. Left in place (owner's data, no live value); the systemic lesson is that
sandbox logs capture whatever the sandbox printed — never let a sandbox echo the environment.

**No tracked file contains a secret** — `git ls-files | grep` for full-format keys returns
nothing, so nothing has ever been pushed with a credential in it.

---

## A. MUST ROTATE — session / account takeover

These mint or validate authenticated sessions. Leaked, an attacker forges a session for
**any** user, including the operator account.

| secret | file | why | status 2026-09-18 |
|---|---|---|---|
| `JWT_SECRET` | `.env`, `server/.env` | signs every JWT | **✅ ROTATED** |
| `SECRET_KEY` | `.env`, `server/.env` | Flask session signing | **✅ ROTATED** |
| `SESSION_SECRET` | `.env`, `server/.env` | session token signing | **✅ ROTATED** |
| `CAPTCHA_BYPASS_SECRET` | `server/.env` | read at `server/config.py:39`; a bypass header that skips CAPTCHA | **✅ ROTATED** |
| `HELPOTRON_ADMIN_PASSWORD` | `mcp/.env` | operator account | **✅ ROTATED** (DB hash + `mcp/.env` re-synced) |
| `DEV_LOGIN_PASSWORD` | `.env` | dev-login, loopback-guarded and behind `DEV_LOGIN_ENABLED` | **✅ ROTATED** |

### Rotation proof (old credential rejected, new credential accepted)

A JWT minted under the **pre-rotation** `JWT_SECRET` for `RoniDev` (id=1) returned
**HTTP 200** before the rotation and **HTTP 401 after** it. Logging in with the new admin
password returns **HTTP 200**, and that token works on `/api/me` (**200**). No service was
broken: `/api/health` 200, HIP `:8099` 200.

Backups of the pre-rotation files: `*.bak-pre-rotation-20260918-131855` (mode 600), alongside
the script that performs the rotation, which never prints a value.

## B. MUST ROTATE — money (billable upstream keys)

These spend real money on every call. **Requires the owner's dashboard — cannot be done from
this box.**

| secret | live? | status |
|---|---|---|
| `OPENROUTER_API_KEY` | **HTTP 200 LIVE** | ⏳ **owner must rotate** — openrouter.ai → Keys |
| `OMNIROUTE_API_KEY` | set (not probed) | ⏳ **owner must rotate** |
| `PANGRAM_API_KEY` | set | ⏳ **owner must rotate** — note Pangram 3 ends 2026-09-30, the same call then costs **10x** (5¢ → 50¢ per 1k words) |
| `SAPLING_API_KEY` | set | ⏳ **owner must rotate** |
| `WINSTON_API_KEY` | set | ⏳ **owner must rotate or delete** — Winston is not a registered detector, the key may be unused |

## C. MUST ROTATE — SMS spend / account

**Requires the owner's Twilio console.**

| secret | status |
|---|---|
| `TWILIO_SECRET` | ⏳ **owner must rotate** |
| `TWILIO_API_KEY_SECRET` | ⏳ **owner must rotate** |

Look out: `TWILIO_SECRET` is duplicated in `.env` and `server/.env` — rotate both or they drift.
`TWILIO_SID`, `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_VERIFY_SERVICE_SID` are
**identifiers, not secrets** — no rotation needed, but they were disclosed, so treat them as public.

## D. ALSO CONSIDER — outside the repo, root-equivalent read

The account is in the `docker` and `sudo` groups, so assume any credential readable by it on
this box was reachable. Checked 2026-09-18:

| secret | location | live? | verdict |
|---|---|---|---|
| GitHub PAT | `~/.git-credentials` | **HTTP 401 — dead** | no rotation needed; confirm it is the old one and not a second entry |
| HF token | `text-improver/.secrets/hf_token` | **HTTP 200 — LIVE** | **rotate** — it can write repos (`create_repo` returned 200 despite a scope list that does not say so) |
| DeepSeek key | `shannon/.secrets/deepseek_key` | **HTTP 200 — LIVE** | **rotate** — this is the owner's paid key |
| SSH keys | `~/.ssh/` | not audited | inspect; regenerate if any agent forwarding or passphrase-less key exists |
| `.env` files of other projects | workspace-wide | not audited | sweep every `**/.env` for the same exposure |

**Note the GitHub PAT is dead but the HF token and DeepSeek key are alive** — a leaked token
being dead is luck, not design. Do not assume the rest are stale.

---

## E. Permission holes found and fixed during this audit

Found while building this inventory; all tightened, and `GET /api/health` still **200** and
`helpotron-hip` still **200** afterwards (verified).

| path | was | now |
|---|---|---|
| `server/.env` | `0664` (world-readable) | `0600` |
| `mcp/.env` | `0664` | `0600` |
| `data/db/helpotron.db` (live prod DB — users + sessions) | `0644` | `0600` |
| `data/db/helpotron.db.bak-pre-token-100x-*` (2 files) | `0644` | `0600` |

`.env` was already `0600`. All services run as the same user, so nothing broke.

---

## F. How to rotate without breaking the running stack

Order matters — JWT/SECRET/SESSION rotation invalidates every existing session, which is the
point, but do it knowingly.

1. Take the API down cleanly or accept that in-flight sessions die.
2. Edit `.env` **and** `server/.env` where the name appears in both (verify with a hash
   compare — several are duplicated and must not drift).
3. `mcp/.env` holds the admin password used by the MCP tooling — update both sides.
4. The server reads `.env` with `load_dotenv(..., override=True)` at import
   (`server/llm.py:18`), so a restart is what makes new values live. `DATABASE_URL` and
   `ENVIRONMENT` are deliberately pinned against the stomp — the same incident that pinned
   them snapped scratch servers onto the prod DB.
5. **No secret is hardcoded in the systemd units** — verified, the only `Environment=` lines
   are `DISPLAY`, `LD_LIBRARY_PATH`, `MAINTENANCE_PORT`. Rotation is a file edit, not a unit
   edit.
6. Rotating `JWT_SECRET`/`SECRET_KEY`/`SESSION_SECRET` logs every user out. Confirm that is
   the intended outcome before doing it.
7. After rotating, re-run the read-only live checks in sections B–D and confirm the **new**
   values authenticate and the old ones do not.

---

## G. The deeper fix (a rotation is not a remediation by itself)

Rotating closes this exposure. It does not close the **class**: the server process could read
its own secrets, execute arbitrary code, and belonged to `sudo` and `docker`. Until the
following hold, the next RCE re-leaks everything:

- `run_shell` must run in a namespace/UID-isolated sandbox **without** `sudo`/`docker` group
  membership. This is the pentest's own remediation note and it is the load-bearing one.
- `sympy` must not be on the allowed-module list; no string-eval-capable call may be reachable
  from an allowlisted module.
- Secrets the web app does not need should not be readable by the web app account.
