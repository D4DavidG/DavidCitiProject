# Short access tokens and refresh tokens (design)

Written 14 Oct for the queue in memory `work-queue-14-oct` ("15-min token"). Plan:
`docs/superpowers/plans/2026-10-14-tokens.md`.

## 1. What and why

The rubric lists "token expiration and refresh", and an evaluator asked: "what if
someone steals the access token? A 15-minute timer?" Today a token is an HS256 JWT that
lasts **8 hours** and carries only the user id (`services/tokens.py:20, 39-59`). The role
is re-read from Postgres on every request (`api/app.py:22-33`), so archiving a user ends
their tokens, but nothing else can: a stolen token works for 8 h, and changing your
password doesn't end other sessions (open item in `CLAUDE.md`).

After this change:

| Thing | Today | After |
| --- | --- | --- |
| Access token (the `Authorization: Bearer` one) | 8 h | **15 min**, still a JWT with `sub`, `iat`, `exp` |
| Refresh token | none | 32 random bytes (`secrets.token_urlsafe(32)`), only its SHA-256 stored; good until **8 h after login** (absolute, never extended) |
| `POST /auth/refresh` | none | swaps a live refresh token for a new access token **and** a new refresh token (rotation) |
| Reusing a rotated refresh token | n/a | 401, and **every live refresh token of that user is revoked** (theft detection). A token revoked by sign out, password change, reset or archive is only refused |
| `POST /auth/logout` | none (the website just forgot the token) | revokes the refresh token sent; 204 |
| Password change, admin reset, archiving a user | archive ends access tokens; the others end nothing | all three revoke every refresh token of the user, and access tokens issued **before the last password change** are refused |

A stolen access token now works for at most 15 minutes. A stolen refresh token works
only until either side uses it after the other: the second use is a reuse, and both are
signed out.

## 2. Decisions

| Decision | Rejected alternative, and why |
| --- | --- |
| **Refresh token travels in the response body and lives in `sessionStorage`** beside the access token (key `acme.refresh`) | An HttpOnly, Secure, SameSite=Strict cookie scoped to `/api/tracker/auth`. It is the stronger option (page scripts can't read it), and CloudFront would carry it without a Terraform change: the API behaviour uses the managed `AllViewerExceptHostHeader` origin request policy (`infra/cloudfront.tf`), which forwards all cookies, and responses pass `Set-Cookie` through. Rejected for three reasons found in the code: (1) locally the page on `:3000` calls the proxy on `:3001` (`VITE_API_URL=http://localhost:3001`), which is cross-origin, and the proxy answers `Access-Control-Allow-Origin: *` (`bin/proxy-server.js:39`), which browsers never combine with credentials; it also forwards no `Cookie` header (`:96-110`). So local development would need a proxy rewrite and `credentials: 'include'`. (2) Function URLs deliver cookies in `event["cookies"]` and want a `"cookies"` list in the response, new code in `api/http.py` that LocalStack would have to prove before the demo. (3) The access token is already in `sessionStorage`, so script running in the page can act as the user either way while the tab is open. Cost of this choice: an XSS bug could copy the refresh token and use it for up to 8 h. Mitigations: React escapes all output and there is no `dangerouslySetInnerHTML` in `src/` (0 hits, 14 Oct); rotation plus reuse detection signs both parties out on the first overlap |
| **Theft detection revokes every live refresh token of the user**, not just one "family" | Tracking token families (a `family_id` column) would sign out only the stolen chain. More columns and more to explain, for a case where signing the user out everywhere is the safe answer |
| **`expires_at` is fixed at login** and copied to each rotated token | Sliding expiry (each refresh adds 8 h) keeps a stolen token alive forever as long as it is used. Fixed means everyone signs in again at most 8 h after login, as today |
| **`users.password_changed_at` + `iat` check** for access tokens | A per-user `token_version` counter in the token. Same effect, but the timestamp also tells an admin *when*, and the token already carries `iat` (`tokens.py:41`). Comparison is in whole seconds: a token is refused when `iat < floor(password_changed_at)`. An access token issued in the same second as the change survives (at most 15 min); tests advance the clock 1 s |
| **Changing your own password returns a fresh session** (same shape as login) | Leaving the caller's tab signed in by exempting its token. Every token from before the change must die, the caller's included; returning a new pair keeps their tab working honestly |
| **Sessions are not audited.** No `record_change` for login, refresh or logout; `refresh_tokens` is not in integrity query 3's table list, so it stays passing | Auditing every 15-minute refresh would flood the audit log and the bell (each row notifies admins). Login isn't audited today either. The revocations that matter (password change, reset, archive) already write their own audit rows. Reuse detection writes a `logger.warning` with the user id (CloudWatch), never the token |
| **`/auth/refresh` and `/auth/logout` are public routes** (no Bearer needed) | Requiring a Bearer token: the access token is usually expired exactly when refresh is called. The refresh token in the body is the credential |
| **Logout answers 204 even for an unknown or already-revoked token** and never triggers reuse detection | A 401: it would tell a caller which tokens exist, and a double click on Sign out would sign the user out of other tabs |
| `refresh_tokens` gets the `no_delete` trigger like every application table | Deleting expired rows: "nothing is deleted" is a rule that doesn't bend. The table grows by one row per 15 minutes per active user, which is nothing at workshop scale |

## 3. Data (migration `005_sessions.sql`, new; never edit 001 to 004)

```sql
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;  -- NULL: never changed, no cut-off

CREATE TABLE refresh_tokens (
    refresh_token_id BIGSERIAL PRIMARY KEY,
    user_id          BIGINT      NOT NULL REFERENCES users (user_id),
    token_hash       TEXT        NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    created_at       TIMESTAMPTZ NOT NULL,
    expires_at       TIMESTAMPTZ NOT NULL,
    revoked_at       TIMESTAMPTZ,
    replaced_by      BIGINT      REFERENCES refresh_tokens (refresh_token_id),
    CHECK (expires_at > created_at),
    CHECK (replaced_by IS NULL OR revoked_at IS NOT NULL)
);
CREATE INDEX refresh_tokens_live ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE TRIGGER no_delete BEFORE DELETE ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION refuse_change();
```

Times come from the injected `now` (Python), not Postgres `now()`, so frozen-clock tests
work. Only the hash is stored: a database leak gives nobody a usable token.

## 4. Backend changes (request path)

```
POST /auth/login    -> users.login: password ok -> sessions.open(conn, user_id, secret, now)
                       -> { token, expiresAt, refreshToken, user }
any route           -> app.authorise: tokens.verify -> Claims(user_id, issued_at)
                       -> actors.load(conn, user_id, issued_at): archived or iat before
                          password_changed_at -> 401 (same message as every other 401)
POST /auth/refresh  -> sessions.rotate(conn, refresh_token, now)  (row locked FOR UPDATE)
                       live -> old row revoked_at = now, replaced_by = new row; new access token
                       revoked/used -> revoke all of that user's live rows, COMMIT, then 401
                       unknown, expired, user archived -> 401
                       -> { token, expiresAt, refreshToken }
POST /auth/logout   -> sessions.end(conn, refresh_token, now) -> 204
POST /auth/change-password -> users.change_password sets password_changed_at = now,
                       revokes all, then a new session -> { token, expiresAt, refreshToken, user }
POST /users/{id}/reset-password, /users/{id}/archive -> also sets/revokes as above
```

- `services/tokens.py`: `LIFETIME = 15 min`; `verify()` returns `Claims(user_id, issued_at)`.
- `services/sessions.py` (new, ~60 lines): `REFRESH_LIFETIME`, `open`, `rotate`, `end`,
  `revoke_all`. The reuse branch revokes inside its own `atomic()` block and raises
  **after** the block, so the revocation commits even though the answer is 401.
- `services/actors.py`: `load()` takes `issued_at` and reads `password_changed_at`.
- `services/users.py`: `login`, `change_password`, `reset_password`, `archive_user` call
  the session functions inside their existing transactions.
- `api/routes.py`: two public routes; `api/handlers.py`: `refresh`, `logout`, and one
  `_session_view()` used by login, change-password and refresh.

## 5. Website changes

- `services/request.js`: holds both tokens. On a 401 from any path except
  `/auth/login`, `/auth/refresh` and `/auth/logout`, it calls one shared
  `refreshSession()` (a single in-flight promise, so ten polling calls make one refresh),
  then retries the original request **once** with the new token. Only if the refresh
  is refused (401 or 400), or the retry is 401 again, does it call the unauthorized
  handler (sign out). If the refresh can't get through (network error, or a 5xx while
  Aurora wakes up), the original call fails with "Can't reach the server... try again",
  both tokens stay, and the next request refreshes again (changed 14 Oct, evening).
  The refresh call uses `fetch` directly, not `request()`, so it can't recurse.
- After a successful refresh it calls a registered `onRefreshed(tokens)` so
  `AuthContext` writes the new pair to `sessionStorage` at once. (If the old refresh
  token were left in storage, a reload would reuse it and sign the user out everywhere.)
- `auth/AuthContext.jsx`: login stores both; `logout()` sends `POST /auth/logout` with
  the refresh token (errors ignored), then clears storage; a new `startSession(result)`
  is used by login and by `ChangePasswordPage` with the change-password response.
- A page reload after 15 min: the stored access token fails the `/auth/me` probe, the
  refresh runs, the probe is retried, and the user stays signed in.

## 6. Error cases

| Case | Answer |
| --- | --- |
| Access token older than 15 min | 401 "Your session is invalid or has expired..." (unchanged message); website refreshes and retries |
| Access token issued before the user's last password change | same 401 |
| Refresh token unknown, malformed, missing, expired, or user archived | 401, nothing revoked |
| Refresh token already rotated (`replaced_by` set) | 401, all of the user's live refresh tokens revoked, warning logged |
| Refresh token revoked without rotation (sign out, password change, reset, archive) | 401, nothing else revoked, so a tab still holding a pre-change token can't sign out the tab that changed the password |
| Logout with any token, or none | 204 |
| Same tab, many calls 401 at once | one `/auth/refresh` request |
| Refresh can't get through (network error or 5xx) | the call fails with "try again"; the session is kept and the next request refreshes again |
| Duplicated browser tab (it copies `sessionStorage`) | whichever tab refreshes second is a reuse: both sign out. Rare; accepted, documented |
| Old website against the new backend (deploy gap) | it knows no refresh: signs out after 15 min. Deploy both together |

## 7. Tests that prove it

Backend (pytest, frozen `NOW`):
- `test_security.py`: access token valid at 14:59, refused at 15:00; `verify` returns `issued_at`.
- `test_sessions.py` (new): only the SHA-256 is stored; rotation revokes the old row,
  links `replaced_by`, keeps `expires_at`; reuse answers 401 and revokes the new token
  too; refused at 8 h after login even if rotated at 7 h 59; logout revokes, and logout
  twice is fine; archived user can't refresh.
- `test_api.py`: login returns `refreshToken`; refresh and logout are public; the full
  HTTP round trip; an access token from before a password change is 401 (clock +1 s);
  change-password returns a working new pair; admin reset and archive end the target's
  refresh tokens.
- `test_schema.py` / `test_no_delete.py`: the new CHECKs refuse bad rows; `DELETE` on
  `refresh_tokens` is refused; the table list includes it.
- `test_api_audit_walk.py`: refresh and logout added to `EXEMPT` with the reason (not
  business records). `test_integrity.py` keeps passing unchanged.

Website (Vitest): one 401 gives one refresh then a retry that succeeds; concurrent 401s
share one refresh; a refused refresh (401 or 400) signs out once; a refresh that can't
get through (network error, 503) keeps the session and the next request refreshes again; a second 401 after retry signs out
without a second refresh; `/auth/login` 401 never refreshes; rotated tokens reach
`onRefreshed`; login stores both; logout calls `/auth/logout`; change-password stores
the new pair.

Live (LocalStack, after a forced cold start applies 005): `curl` login, refresh, reuse
of the first refresh token gives 401, and the second refresh token is then dead too.
Playwright: the existing suite stays green.

## 8. Docs that change (same commits as the code)

- `CLAUDE.md`: §8 "The rubric expects token refresh" becomes built; drop the open item
  "old sessions survive a password change"; add migration 005 to the not-deployed list
  and the file tree; Accounts row mentions the 15-minute token.
- `README.md`: the "No refresh tokens" and "Known security gaps" bullets (`:373-390`),
  the test table row for `test_security.py`.
- `docs/REPOINFO.md`: the refresh answer (`:324`), question 9 on stolen tokens
  (`:575-580`, now built, with file and line pointers), the gaps list (`:677`), the
  numbers table (`:925`). `docs/GUIDE.md:490`. `docs/DEMO-RUNBOOK.md` not-deployed list.
- `tools/demo.py`: take the new token from the change-password response.
  `tools/tracker.http`: the token now lasts 15 min.
