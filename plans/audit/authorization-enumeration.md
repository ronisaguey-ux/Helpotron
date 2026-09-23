# Row-Level Authorization Enumeration — Helpotron

Agent 10/10. Deliverable: a complete, checkable route list where every row names the guard and its location. Read-only; nothing implemented.

## Verdict

**86 routes take an object identifier. 85 guarded. 1 UNGUARDED (cross-user write, not a read).**

The single finding is a write-side IDOR: `server/main.py:861-866` mutates an `Assignment` row (progress + status) looked up by a client-supplied `assignment_id` **with no `user_id` ownership predicate**, reachable from 5 endpoints. Every sibling code path (`upsert_assignment` `main.py:1654-1659`, `generate_draft` `main.py:2384-2386`, `export-gdocs` `main.py:2488-2490`) validates ownership — this one does not. See FINDING 1 below.

The prior "CLEAN" adjudication is **confirmed correct on the read side**: no route returns another user's object. The 13 flagged routes were, as recorded, false positives with a real guard one line away.

## (a) The full enumeration

Legend: **OWNED** = scoped to caller (predicate in query, or fetch-then-403/404); **ADMIN-ONLY** = gated by `require_admin`/`is_admin_user`; **PUBLIC-BY-DESIGN** = anonymous by necessity (recovery, enum-mitigated); **LOGIN-FLOW** = pre-auth 2FA, code-possession-gated; **UNGUARDED** = acts on another user's row.

| # | Method + path | file:line | id source | guard (quoted) | guard file:line | verdict |
|---|---|---|---|---|---|---|
| 1 | GET `/api/assignments/{assignment_id}/subagent-team/status` | main.py:616 | path | `Assignment.id == assignment_id, Assignment.user_id == current_user.id` | main.py:623-626 | OWNED |
| 2 | POST `/api/assignments/{assignment_id}/subagent-team/interrupt` | main.py:633 | path | same predicate | main.py:641-644 | OWNED |
| 3 | POST `/api/admin/user/{public_id}/credits` | main.py:1447 | path | `require_admin(request)` in `adjust_user_credits` | admin.py:258 | ADMIN-ONLY |
| 4 | POST `/api/admin/user/{public_id}/welcome-tokens` | main.py:1455 | path | `require_admin(request)` in `grant_welcome_tokens` | admin.py:287 | ADMIN-ONLY |
| 5 | POST `/api/admin/user/{public_id}/plan` | main.py:1466 | path | `require_admin(request)` in `set_user_plan` | admin.py:484 | ADMIN-ONLY |
| 6 | POST `/api/admin/user/{public_id}/verify-trial-payment` | main.py:1473 | path | `require_admin(request)` in `verify_trial_payment` | admin.py:463 | ADMIN-ONLY |
| 7 | POST `/api/admin/user/{public_id}/reset-password` | main.py:1482 | path | `require_admin(request)` in `reset_user_password` | admin.py:497 | ADMIN-ONLY |
| 8 | POST `/api/admin/user/{public_id}/ban` | main.py:1489 | path | `require_admin(request)` in `ban_user` | admin.py:517 | ADMIN-ONLY |
| 9 | POST `/api/admin/user/{public_id}/unban` | main.py:1495 | path | `require_admin(request)` in `unban_user` | admin.py:534 | ADMIN-ONLY |
| 10 | POST `/api/admin/user/{public_id}/tempban` | main.py:1501 | path | `require_admin(request)` in `temp_ban_user` | admin.py:551 | ADMIN-ONLY |
| 11 | POST `/api/admin/user/{public_id}/kick` | main.py:1508 | path | `require_admin(request)` in `kick_user` | admin.py:571 | ADMIN-ONLY |
| 12 | DELETE `/api/admin/user/{public_id}` | main.py:1514 | path | `require_admin(request)` in `delete_user` | admin.py:584 | ADMIN-ONLY |
| 13 | POST `/api/admin/user/{public_id}/act` (impersonate) | main.py:1520 | path | `admin = require_admin(request)` + refuses admin targets | main.py:1528,1532-1533 | ADMIN-ONLY |
| 14 | POST `/api/users` (body `public_id`) | main.py:1579 | body | `if body.public_id != user.public_id and not is_admin_user(user): 403` (write target always caller) | main.py:1582-1583 | OWNED |
| 15 | PATCH `/api/users/{public_id}` | main.py:1591 | path | `if user.public_id != public_id: 403` (no admin exemption) | main.py:1605-1610 | OWNED |
| 16 | GET `/api/status/{public_id}` | main.py:1818 | path | `if current_user.public_id != public_id: 403` | main.py:1820-1821 | OWNED |
| 17 | POST `/api/transcribe` (form/query `assignment_id`) | main.py:1836 | form/query | `if a and a.user_id == current_user.id` (transcript row is caller-owned) | main.py:1879-1882 | OWNED |
| 18 | POST `/api/study-guide` (body `assignment_id`) | main.py:1889 | body | **none** — `_generate` mutates `db.get(Assignment, assignment_id)` unguarded | main.py:861-866 | **UNGUARDED** |
| 19 | POST `/api/flashcards` (body `assignment_id`) | main.py:1894 | body | **none** — same path | main.py:861-866 | **UNGUARDED** |
| 20 | POST `/api/practice-test` (body `assignment_id`) | main.py:1899 | body | **none** — same path | main.py:861-866 | **UNGUARDED** |
| 21 | POST `/api/summary` (body `assignment_id`) | main.py:1904 | body | **none** — same path | main.py:861-866 | **UNGUARDED** |
| 22 | POST `/api/generate/stream/{kind}` (body `assignment_id`) | main.py:1924 | body | **none** — same path (`kind` is a generation kind, not an object id) | main.py:861-866 | **UNGUARDED** |
| 23 | GET `/api/materials/{public_id}/{kind}` | main.py:1981 | path | `if current_user.public_id != public_id: 403` | main.py:1987-1988 | OWNED |
| 24 | GET `/api/dashboard` (query `public_id`) | main.py:2087 | query | `if current_user.public_id != target_id: 403` | main.py:2100-2101 | OWNED |
| 25 | GET `/api/dashboard/{public_id}` | main.py:2105 | path | `if current_user.public_id != public_id: 403` | main.py:2107-2108 | OWNED |
| 26 | GET `/api/credits/{public_id}` | main.py:2113 | path | `if current_user.public_id != public_id: 403` | main.py:2115-2116 | OWNED |
| 27 | GET `/api/agent/{session_id}` | main.py:2309 | path | `session.user_public_id != current_user.public_id → 404` | main.py:2311-2313 | OWNED |
| 28 | WS `/ws/agent/{session_id}` | main.py:2317 | path | same check → close(1008) | main.py:2325-2328 | OWNED |
| 29 | POST `/api/style/upload` (body `public_id`) | main.py:2347 | body | `if current_user.public_id != body.public_id: 403` | main.py:2350-2351 | OWNED |
| 30 | GET `/api/style/{public_id}` | main.py:2356 | path | `if current_user.public_id != public_id: 403` | main.py:2359-2360 | OWNED |
| 31 | POST `/api/draft/generate` (body `assignment_id`,`public_id`) | main.py:2373 | body | `if not assignment or assignment.user_id != current_user.id: 404` (body `public_id` unused) | main.py:2384-2386 | OWNED |
| 32 | GET `/api/draft/{draft_id}` | main.py:2397 | path | `if not draft or draft.user_id != current_user.id: 404` | main.py:2400-2402 | OWNED |
| 33 | POST `/api/draft/{draft_id}/retry` | main.py:2420 | path | same | main.py:2423-2425 | OWNED |
| 34 | POST `/api/draft/{draft_id}/admin` | main.py:2446 | path | `current_user: User = Depends(require_admin)` | main.py:2447 | ADMIN-ONLY |
| 35 | POST `/api/assignment/{assignment_id}/export-gdocs` | main.py:2485 | path | `if not assignment or assignment.user_id != current_user.id: 404` | main.py:2488-2490 | OWNED |
| 36 | GET `/api/assignments/export` (query `assignment_id`) | routes_assignment_direction.py:74 | query | `filter(Assignment.user_id == current_user.id)` + `filter(Assignment.id == assignment_id)` → 404 | routes_assignment_direction.py:89-94 | OWNED |
| 37 | GET `/api/assignments/{assignment_id}/direction` | routes_assignment_direction.py:211 | path | `_get_owned_assignment` = `Assignment.id == id, Assignment.user_id == user_id` → 404 | :50-58, 219 | OWNED |
| 38 | POST `/api/assignments/{assignment_id}/choose-direction` | :223 | path | `_get_owned_assignment` | :238 | OWNED |
| 39 | POST `/api/assignments/{assignment_id}/mark-done` | :249 | path | `_get_owned_assignment` | :256 | OWNED |
| 40 | POST `/api/assignments/{assignment_id}/archive` | :261 | path | `_get_owned_assignment` | :268 | OWNED |
| 41 | PATCH `/api/keys/{key_id}` | routes_api_keys.py:88 | path | `ApiKey.id == key_id, ApiKey.user_id == user.id` → 404 | api_keys.py:145-147 | OWNED |
| 42 | DELETE `/api/keys/{key_id}` | routes_api_keys.py:103 | path | `ApiKey.id == key_id, ApiKey.user_id == user.id` → 404 | api_keys.py:130-133 | OWNED |
| 43 | PATCH `/api/calendar/entries/{entry_id}` | routes_calendar.py:174 | path | `_owned` = `CalendarEntry.id == id, user_id == user.id` → 404 | :89-97, 182 | OWNED |
| 44 | DELETE `/api/calendar/entries/{entry_id}` | routes_calendar.py:203 | path | `_owned` | :210 | OWNED |
| 45 | POST `/api/calendar/entries/{entry_id}/reminded` | routes_calendar.py:216 | path | `_owned` | :227 | OWNED |
| 46 | PATCH `/api/feedback/{feedback_id}` | routes_datalake.py:152 | path | `if not is_admin_user(current_user): 403` | :159-160 | ADMIN-ONLY |
| 47 | POST `/api/datalake/microcredits/{submission_id}/implement` | routes_datalake.py:222 | path | `require_admin(request)` | :233 | ADMIN-ONLY |
| 48 | DELETE `/api/datalake/{entry_id}` | routes_datalake.py:438 | path | string: `not owner_hash or owner_hash != _anonymize_id(public_id)` → 403 (fail-closed); numeric: `entry.user_id != current_user.id` → 403 | :477-480, 490-491 | OWNED |
| 49 | POST `/api/dump/{dump_id}/route` | routes_dump.py:322 | path | `if item.user_id != current_user.id and not is_admin_user(...): 403` | :333-334 | OWNED |
| 50 | POST `/api/dump/{dump_id}/finalize` | routes_dump.py:792 | path | same | :810-811 | OWNED |
| 51 | DELETE `/api/dump/{dump_id}` | routes_dump.py:817 | path | same | :827-828 | OWNED |
| 52 | GET `/api/dump/{dump_id}` | routes_dump.py:861 | path | same | :871-872 | OWNED |
| 53 | GET `/api/export/flashcards/{material_id}/quizlet` | routes_export.py:24 | path | `StudyMaterial.id == material_id, StudyMaterial.user_id == user.id` → 404 | :30-36 | OWNED |
| 54 | GET `/api/export/flashcards/{material_id}/anki` | :47 | path | same | :53-58 | OWNED |
| 55 | GET `/api/export/practice-test/{material_id}/json` | :70 | path | same | :76-81 | OWNED |
| 56 | GET `/api/export/study-guide/{material_id}/markdown` | :93 | path | same | :99-104 | OWNED |
| 57 | GET `/api/export/summary/{material_id}/txt` | :114 | path | same | :120-125 | OWNED |
| 58 | GET `/api/export/study-guide/{material_id}/latex` | :135 | path | same | :142-147 | OWNED |
| 59 | GET `/api/export/summary/{material_id}/latex` | :157 | path | same | :164-169 | OWNED |
| 60 | GET `/api/export/download/{filename}` | :185 | path | traversal guard + `user_root = EXPORT_DIR / user.public_id` | :189-195 | OWNED |
| 61 | POST `/api/extension/releases/{release_id}/read` | routes_extension.py:518 | path | release feed is public; read receipt keyed `user_id == me.public_id` | :524-527 | PUBLIC-BY-DESIGN |
| 62 | POST `/api/extension/approval/respond` (body `req_id`) | routes_extension.py:2185 | body | `if perm_entry.get("user_public_id") != user.public_id: 403` | :2213-2214 | OWNED |
| 63 | GET `/api/extension/agent_chat/history` (query `thread_id`) | routes_extension.py:2225 | query | history keyed by `user.id` (`load_chat_history_from_db(db, user.id, thread_id)`) | :2233,2236 | OWNED |
| 64 | POST `/api/library/materials/{material_id}/save` | routes_library.py:71 | path | `if m.user_id != user.id and user.id not in (m.shared_with or []): 403` | :81-82 | OWNED |
| 65 | DELETE `/api/library/materials/{material_id}/unsave` | routes_library.py:96 | path | same | :106-107 | OWNED |
| 66 | DELETE `/api/library/materials/{material_id}` | routes_library.py:120 | path | `if m.user_id != user.id: 403` (creator only) | :136-137 | OWNED |
| 67 | GET `/api/assignment/{assignment_id}/full-view` | routes_overlord.py:328 | path | `Assignment.id == id, Assignment.user_id == user.id` → 404 | :332-334 | OWNED |
| 68 | GET `/api/assignment/{assignment_id}/launch-doc-payload` | routes_overlord.py:382 | path | same | :386-388 | OWNED |
| 69 | PATCH `/api/agent/threads/{thread_id}` | routes_overlord.py:704 | path | `AgentChatThread.id == id, user_id == user.id` → 404 (id 0 = own settings) | :722-724 | OWNED |
| 70 | DELETE `/api/agent/threads/{thread_id}` | routes_overlord.py:734 | path | `if t.user_id != user.id: 403` (id 0 = own settings) | :766-767 | OWNED |
| 71 | POST `/api/agent/permission/respond` (body `permission_id`) | routes_overlord.py:970 | body | `if perm_entry.get("user_public_id") != user.public_id: 403` | :981-982 | OWNED |
| 72 | DELETE `/api/agent/permissions/rules/{rule}` | routes_overlord.py:1026 | path | operates on `user.settings` (own blob) | :1030-1031 | OWNED |
| 73 | DELETE `/api/agent/memory/{entry_id}` | routes_overlord.py:1071 | path | `delete_memory(user.public_id, entry_id)` | :1075 | OWNED |
| 74 | GET `/api/agent/files/{file_id}` | routes_overlord.py:1106 | path | `AgentFile.id == file_id, AgentFile.user_id == user.id` → 404 | :1112-1114 | OWNED |
| 75 | DELETE `/api/agent/files/{file_id}` | routes_overlord.py:1129 | path | `delete_agent_file(user.id, file_id)` = `AgentFile.id == file_id, user_id == user_id` | agent_files.py:89-92 | OWNED |
| 76 | GET `/api/agent/chat/{assignment_id}` | routes_overlord.py:1199 | path | assignment `id+user_id` OR thread `id+user_id` → 404 | :1206-1220 | OWNED |
| 77 | POST `/api/agent/chat` (body `assignment_id`/`thread_id`) | routes_overlord.py:2445 | body | `_build_agent_chat_prompt` scopes `Assignment.id == id, user_id == user.id`; history keyed `user.id` | :2247-2249, 2232 | OWNED |
| 78 | POST `/api/agent/chat/stream` (body `assignment_id`/`thread_id`) | routes_overlord.py:2287 | body | same `_build_agent_chat_prompt` | :2292 | OWNED |
| 79 | DELETE `/api/referrals/{code_id}` | routes_referral.py:70 | path | `Referral.id == code_id, Referral.referrer_id == user.id` → 404 | :77-81 | OWNED |
| 80 | POST `/api/groups/share` (body `group_id`,`material_id`) | routes_study_groups.py:42 | body | membership check + `StudyMaterial.user_id == user.id` | study_groups.py:54-65 | OWNED |
| 81 | GET `/api/groups/{group_id}/materials` | routes_study_groups.py:65 | path | membership check → 403 | study_groups.py:81-86 | OWNED |
| 82 | POST `/api/study/decks/{material_id}/review` | routes_study_tools.py:131 | path | `_owned_material_or_404` = `id == material_id AND (user_id == user.id OR shared_with)` → 404 | :35-48, 139 | OWNED |
| 83 | POST `/api/study/quiz/{material_id}/grade` | routes_study_tools.py:201 | path | `_owned_material_or_404` | :209 | OWNED |
| 84 | GET `/api/study/mastery/{material_id}` | routes_study_tools.py:333 | path | `_owned_material_or_404` | :340 | OWNED |
| 85 | POST `/api/trash/{trash_id}/restore` | routes_trash.py:56 | path | `TrashItem.id == trash_id, TrashItem.user_id == user.id` → 404 | :59-65 | OWNED |
| 86 | DELETE `/api/trash/{trash_id}` | routes_trash.py:95 | path | same | :99-105 | OWNED |
| 87 | DELETE `/api/user/styles/{sample_id}` | routes_user_settings.py:250 | path | `delete_custom_style_sample(db, user, ...)` on `get_user_settings(user)` (own blob) | user_settings_service.py:734-739 | OWNED |
| 88 | DELETE `/api/user/custom-subjects/{subject_id}` | routes_user_settings.py:282 | path | own settings blob | user_settings_service.py:801-807 | OWNED |
| 89 | DELETE `/api/user/custom-bubbles/{bubble_id}` | routes_user_settings.py:315 | path | own settings blob | user_settings_service.py:844-850 | OWNED |
| 90 | DELETE `/api/user/trio/{rule_id}` | routes_user_settings.py:356 | path | own settings blob | user_settings_service.py:766-771 | OWNED |
| 91 | DELETE `/api/user/personas/{persona_id}` | routes_user_settings.py:401 | path | own settings blob | user_settings_service.py:681-688 | OWNED |
| 92 | POST `/api/user/admin/messages/{message_id}/reply` | routes_user_settings.py:865 | path | `_require_admin_request(request)` | :868 (→ admin.py:46) | ADMIN-ONLY |
| 93 | POST `/api/admin/moderation/{mod_id}/action` | routes_admin_advanced.py:112 | path | `require_admin(request)` | :125 | ADMIN-ONLY |
| 94 | POST `/api/admin/messages/{message_id}/reply` | routes_admin_advanced.py:185 | path | `require_admin(request)` | :188 | ADMIN-ONLY |
| 95 | DELETE `/api/admin/messages/{message_id}` | routes_admin_advanced.py:208 | path | `require_admin(request)` | :211 | ADMIN-ONLY |
| 96 | POST `/api/admin/costs/users/{public_id}/multiplier` | routes_admin_advanced.py:348 | path | `require_admin(request)` | :356 | ADMIN-ONLY |
| 97 | GET `/api/admin/costs/budget` (query `user_id`) | routes_admin_advanced.py:369 | query | `_resolve_budget_subject` → self or `require_admin` | :16-32, 376 | OWNED/ADMIN |
| 98 | POST `/api/admin/costs/budget` (query `user_id`) | routes_admin_advanced.py:411 | query | `_resolve_budget_subject` | :414 | OWNED/ADMIN |
| 99 | POST `/api/admin/costs/estimate` (query `user_id`) | routes_admin_advanced.py:427 | query | `_resolve_budget_subject` | :431 | OWNED/ADMIN |
| 100 | POST `/api/agent/actions/{action_id}/undo` | routes_agent_actions.py:25 | path | `AgentAction.id == action_id, user_id == user.id` → 404 | :30-32 | OWNED |
| 101 | GET `/api/recovery/options` (query `public_id`) | routes_recovery.py:50 | query | masked, enum-mitigated (uniform schema for unknown accounts) | :55-66 | PUBLIC-BY-DESIGN |
| 102 | POST `/api/recovery/request` (body `public_id`) | routes_recovery.py:82 | body | code-possession, enum-mitigated generic 200 | :88-98 | PUBLIC-BY-DESIGN |
| 103 | POST `/api/recovery/verify` (body `public_id`) | routes_recovery.py:101 | body | code/token possession (`verify_and_reset`) | :106-113 | PUBLIC-BY-DESIGN |
| 104 | POST `/api/2fa/send-challenge` (body `user_id`) | routes_auth_2fa.py:367 | body | enum-mitigated, uniform responses | :375-402 | LOGIN-FLOW |
| 105 | POST `/api/2fa/verify-challenge` (body `user_id`) | routes_auth_2fa.py:411 | body | code possession (TOTP/SMS/email) + rate limit | :414-450 | LOGIN-FLOW |
| 106 | POST `/api/analytics/session` (body `material_id`) | routes_analytics.py:39 | body | logs a `StudySession` for `user.id` (no cross-user read) | :53-55 | OWNED |
| 107 | POST `/api/profile/public-id` | routes_profile.py:142 | body | self + `require_session_auth` + password verification + uniqueness | :164-194 | OWNED |
| 108 | POST `/api/notifications/read` (body `ids`) | routes_notifications.py:157 | body | `elif notice.user_id == user.public_id` before marking a direct notice | :186-189 | OWNED |

> Rows 18–22 are five endpoints sharing one unguarded code path (`main.py:861-866`) — one finding, five surfaces.


## (b) The four hiding patterns — findings

**(a) id used in `.get()`/`.filter()` with the ownership predicate added later or not at all.**
- The one true hit: `_generate` at `main.py:861-866` — `assignment = db.get(Assignment, assignment_id)` with no later predicate. See FINDING 1.
- Correct siblings predicate in the same query: `upsert_assignment` `main.py:1654-1659`, `generate_draft` `main.py:2384-2386`.
- `routes_library.py:78-82` and `:103-107` are the "fetch-then-check" variant (row fetched by id alone, then `m.user_id != user.id → 403`). Guarded — no leak, since the row is serialized only after the check passes.

**(b) admin fallthrough — re-verified.** `require_admin` (`admin.py:46-81`) does **not** fall through to the session cookie in the Bearer branch: `admin.py:52-61` tries `verify_jwt_token(token)` then `SessionStore.get_session(token)` — the **same** token — and never reads `request.cookies`. The cookie path exists only in the `else` (no Authorization header). `require_admin` also has **no API-key branch**, so an `htk_` key is rejected 401 (both `verify_jwt_token` and `SessionStore.get_session` fail on a key string). No admin route is reachable by a plain cookie, an API key, or a garbage-Bearer-plus-cookie request. Confirmed.

Dead-variable note: `routes_overlord.py:741` computes `is_admin` but `delete_chat_thread` then only allows `t.user_id == user.id` (`:766-767`). Admins cannot delete another user's thread here — over-restrictive, not a hole.

**(c) body/`public_id` acting as another account.**
- `POST /api/users` (`main.py:1579-1588`): the guard gained an admin exemption (`not is_admin_user(user)` at `:1582`), but it is **inert** — the write target is always `current_user` (`main.py:1581`), so an admin passing a foreign `body.public_id` still only mutates their own `telegram_id`. No cross-account write. The exemption lives on `/api/users`, not `/api/admin/`, but cannot redirect the write, so it is harmless (dead; one-line cleanup, not a fix).
- `PATCH /api/users/{public_id}` (`main.py:1591-1619`): strictly self-service, **no** admin exemption (`main.py:1605-1610`) — matches the owner's 2026-09-22 decision. Correct.
- `microcredits` submit/history/redeem and `feedback` submit carry a `user_id` field in the body but **ignore it** in favor of `current_user.public_id` (`routes_datalake.py:185, 265, 338, 113`). Correct (BATCH-04).

**(d) API-key surface.** `api_keys.authenticate` (`api_keys.py:222-278`) resolves the key to its owner via `User.id == key_row.user_id` (`:261`) and sets `request.state.auth_via_api_key`/`api_key_id`. Every id-taking route derives identity from that `user`, so a stolen key can only ever reach the **key owner's** rows — never an id supplied in the request. `require_session_auth` (`security.py:571-588`) additionally refuses keys on mint/password/billing/account-rename surfaces. No key-authenticated route uses a request-supplied `user_id`/`public_id` to select a different account.

## (c) Recently-touched routes — verification

- **`routes_datalake.py` DELETE `/api/datalake/{entry_id}`** (uncommitted, `git diff` +100/-5). The change widens `entry_id` from `int` to `str` and proves ownership against the stored `user_hash`. **Fails closed**: `if not is_admin and (not owner_hash or owner_hash != expected): 403` (`routes_datalake.py:479-480`). A record predating anonymization has `user_hash` absent → `not owner_hash` is True → 403 for non-admins. Admin is exempt (`is_admin` short-circuits). The numeric branch retains `entry.user_id != current_user.id and not is_admin → 403` (`:490-491`). `DataSubmission.user_id` is `ForeignKey("users.id")` (`database.py:420`), so the int comparison is type-correct. **Correct and fail-closed.**
- The same diff added `/api/reports/key` (authed) and `/api/reports/open` (admin-only via `is_admin_user`, `routes_datalake.py:56-57`) — both take no object id; the report `key_id` is single-use and the envelope is opened server-side.
- `routes_extension.py` uncommitted diff (+19) is unrelated to id handling (scroll/vision); no new id-taking route.
- **`routes_health.py` does not exist.** Health surface is `GET /health` (`main.py:1553-1555`, public, no id) and `admin_advanced.get_system_health` (admin-only).
- No route in the last 15 commits (`git log --oneline -15`) adds a new id-taking surface; the changes are docs/tests/perf.

## (d) Verdict line

**108 id-taking surfaces enumerated. 107 guarded (OWNED / ADMIN-ONLY / PUBLIC-BY-DESIGN / LOGIN-FLOW with possession or enumeration defense). 1 UNGUARDED cross-user write**, reachable from 5 endpoints (`/api/study-guide`, `/api/flashcards`, `/api/practice-test`, `/api/summary`, `/api/generate/stream/{kind}`). **No cross-user read exists anywhere.**

## (e) FINDING 1 — unguarded cross-user write on material generation

**File / change:** `server/main.py:861-866`, in `_generate`:

```python
if assignment_id is not None:
    assignment = db.get(Assignment, assignment_id)
    if assignment:
        assignment.progress = {**assignment.progress, kind: True}
        if all(assignment.progress.get(k) for k in ALL_MATERIAL_KINDS):
            assignment.status = "materials_ready"
```

Replace with a scoped lookup that 404s foreign ids (matching every sibling route):

```python
if assignment_id is not None:
    assignment = (
        db.query(Assignment)
        .filter(Assignment.id == assignment_id, Assignment.user_id == user.id)
        .first()
    )
    if assignment:
        assignment.progress = {**assignment.progress, kind: True}
        if all(assignment.progress.get(k) for k in ALL_MATERIAL_KINDS):
            assignment.status = "materials_ready"
```

**Why it matters:** `assignment_id` is client-supplied (`GenerateIn.assignment_id`, `main.py:926`). A caller enumerating sequential integer ids mutates another user's `Assignment.progress` and can force `status="materials_ready"` — a cross-user **write** (row-level write violation), not a read. The same value is also stamped onto the caller's new `StudyMaterial.assignment_id` (`main.py:844`), linking their material into a foreign bubble. No data is disclosed, so this is not an IDOR *read* — but it is the same failure class on the write path, and the one spot in the file that omits the `user_id` predicate its siblings all carry (`main.py:1657, 2385, 2489`).

**Test that FAILS without the fix** (drives the HTTP layer, `server/tests/`):

```python
def test_generate_does_not_mutate_foreign_assignment(client, db_session):
    a = create_user(public_id="alice"); b = create_user(public_id="bob")
    foreign = Assignment(user_id=b.id, title="bob's", status="pending_approval", progress={})
    db_session.add(foreign); db_session.commit()
    login(client, "alice")
    client.post("/api/summary", json={
        "public_id": "alice", "transcript_text": "some text",
        "assignment_id": foreign.id,
    })
    db_session.refresh(foreign)
    # without the fix foreign.progress["summary"] is True and status flips
    assert foreign.progress.get("summary") is not True
    assert foreign.status == "pending_approval"
```

**Verify command:** `./.venv/bin/python -m pytest server/tests/test_authorization_generate.py -q` — asserts the foreign assignment is unchanged while the caller's own material still generates (200).

## (f) The convention to follow

**`_get_owned_<thing>(db, user, id)` that 404s, not 403s.** The pattern already appears as `_get_owned_assignment` (`routes_assignment_direction.py:50-58`), `_owned` (`routes_calendar.py:89-97`), `_owned_material_or_404` (`routes_study_tools.py:20-48`), and inline in `api_keys.delete_key`/`update_limits` (`api_keys.py:111-133, 141-147`), `delete_agent_file` (`agent_files.py:86-103`), and the `AgentFile.id == file_id, AgentFile.user_id == user.id` lookups.

The rule for every new route that takes an object id:
1. resolve the caller through the shared pipeline (`get_current_authenticated_user` / `get_current_user`) — never the `X-Public-ID` header, never a body `public_id` as identity;
2. `db.query(Model).filter(Model.id == id, Model.user_id == user.id).first()` — the predicate is *in the query*, not after it;
3. `if not row: raise HTTPException(404, ...)`.

**Why 404 beats 403:** a 404 makes a foreign id indistinguishable from a nonexistent one, so the caller cannot use the response to enumerate which ids exist (an existence oracle). 403 leaks existence. The one place this codebase correctly deviates is where the caller may legally see the object via a *second* relationship (`shared_with` in `_owned_material_or_404`, group membership in `study_groups`) — there the predicate is still in the query, only the predicate is `user_id == user.id OR shared_with.contains([user.id])`.

## (g) RISKS / DO NOT DO

- **Do not report an IDOR without quoting the guard you checked.** The prior sweep's failure was an assertion ("all 13 are false positives") with no per-route `file:line` of the guard. Every row above quotes the exact predicate and its location. An unquotable verdict is exactly the failure this task exists to correct.
- **Do not "fix" by adding an admin exemption to `_generate`.** The correct fix scopes the lookup to `Assignment.user_id == user.id` (404 on foreign). Adding `or is_admin_user(user)` would re-open the write for admins and is not what any sibling route does.
- **Do not change `PATCH /api/users/{public_id}` to allow admin cross-user writes.** The owner's 2026-09-22 decision (`main.py:1601-1603`) is that cross-account changes go through `/api/admin/` only. Leave the no-exemption guard as-is.
- **Do not "tighten" the library fetch-then-check to 404.** `routes_library.py:81-82` intentionally returns 403 for a *known* shared/foreign material; changing to 404 would leak existence only if the client already holds the id (which is why 404 is preferred — but this is a pre-existing, low-severity distinction, not a hole).
- **Do not touch `require_admin`'s structure.** It is correct: no cookie fallthrough in the Bearer branch, and no API-key branch (keys must never reach admin routes). "Simplifying" it to reuse `get_current_user` would silently accept API keys on admin surfaces.
- **UNVERIFIED (not test-run):** I did not execute the `test_generate_does_not_mutate_foreign_assignment` test or run `pytest` — the trees are dirty with the owner's WIP and the live `helpotron-api.service` must not be disturbed. The finding is a code-level conclusion (the missing predicate is unambiguous in `main.py:861-866`); the test above is the verification to run when a fix lands.
