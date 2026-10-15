# Manual Verification Checklist: what Claude could not run

**For:** David, in his own terminal on the VDI (not through Claude: the AWS deploy is
blocked for Claude, and `~/.bashrc` only loads in an interactive shell).

**Goal:** Prove on real AWS what has only been proven locally, and back the work up to
GitHub. Each step says what to run, what a pass looks like, and what to do if it fails.

**Covers:** `CLAUDE.md` §7 (the six first-deploy checks), the push, CI, and the demo and
load test against the deployed URL.

**Time:** about 1 hour, most of it waiting for the first deploy (Aurora).

**Rules while doing this:**

- Never paste the participant code, the LocalStack token or any password into a file in
  the repo. No command below needs anything typed into it: values come from Terraform
  or a hidden prompt.
- Don't run `bin/cleanup-environment.sh`. It destroys everything.
- Tick each box (`- [x]`) and fill in the results table at the end. Then paste the table
  to Claude, with the full output of any step that failed.

---

## Part 0: Start clean (5 min)

- [ ] **0.1 Open a terminal on the VDI and go to the repo**

  ```sh
  cd ~/DavidCitiProject && git status --short
  ```
  Expected: the dashboard work shows as modified (`M` lines under `backend/`, `tests/`,
  `tools/`, `README.md`, `CLAUDE.md`), plus `?? "A-David's Notes.md"`.

- [ ] **0.2 Commit the dashboard work**, leaving your notes file out (`-u` only stages
  files git already tracks)

  ```sh
  git add -u docs/superpowers/plans 2>/dev/null; git add -u && git add docs/superpowers/plans/2026-10-13-manual-verification.md
  git commit -m "Dashboard cards, allocation breakdown, manual verification checklist"
  git status --short
  ```
  Expected: only `?? "A-David's Notes.md"` is left.

- [ ] **0.3 Run the whole test suite yourself**

  ```sh
  .venv/bin/pytest -q
  ```
  Expected last line: `369 passed`.
  If you get `connection refused`: Postgres is down. Run `./bin/start-dev.sh`, wait for
  "All Components Verified!", then press Ctrl+C. Postgres keeps running.

---

## Part 1: Push and CI (10 min)

- [x] **1.1 Push the branch**

  ```sh
  git push origin David
  ```
  Expected: `David -> David`. If it asks for a password: GitHub no longer accepts your
  account password here. Use a personal access token from
  https://github.com/settings/tokens (classic, `repo` scope) as the password.

- [ ] **1.2 Check CI is green**

  Open https://github.com/D4DavidG/DavidCitiProject/actions and wait about 2 minutes.
  Three workflows run on the push:

  | Workflow | Expected |
  | --- | --- |
  | Security Check - Python (bandit) | green. Claude ran the same scan on Python 3.11, exit 0 |
  | Security Check - Terraform (checkov) | green (`soft_fail`: it reports but never fails) |
  | Security Check - React (npm audit) | green (the frontend hasn't changed) |

  If the Python one is red: open it, find the `>> Issue: [B...]` lines, and paste them to
  Claude.

- [ ] **1.3 Decide about making the repo private**

  The repo is public, and your personal docs are still in its history (older commits).
  First ask the organisers whether evaluators need to see the repo. If they do, either
  leave it public, or make it private and add them as collaborators. To make it private:
  GitHub repo → **Settings** → **General** → scroll to **Danger Zone** → **Change
  visibility** → **Private**.

---

## Part 2: Deploy the backend to AWS (20 to 25 min, mostly waiting)

- [x] **2.1 Load your variables and check them**

  ```sh
  source ~/.bashrc
  echo "$AWS_REGION $PARTICIPANT_ID"
  ```
  Expected: `us-east-2 c7dabfc1`.

- [x] **2.2 Deploy**

  ```sh
  ./bin/deploy-backend.sh
  ```
  It fetches fresh AWS credentials, then runs Terraform. The first run creates Aurora, so
  expect 15 to 20 minutes. Expected near the end: `Apply complete! Resources: ... added`,
  then `INFO: Infrastructure deployment complete!`.

  | If you see | Do |
  | --- | --- |
  | `ExpiredToken` or `InvalidClientTokenId` | `./bin/setup-participant.sh`, then run 2.2 again |
  | `Error acquiring the state lock` | Another Terraform run is going. Wait, or ask Claude before using `force-unlock` |
  | Anything else red | Paste the last 40 lines to Claude |

- [x] **2.3 Load the URL and the first admin password into this terminal.** Run this
  right after 2.2: a later local `start-dev.sh` switches Terraform back to LocalStack.
  Nothing to type by hand: the address mixes `1` and `l`, and a typo gives `000`.

  ```sh
  export TRACKER_API="$(set -a; source ENVIRONMENT.config; terraform -chdir=infra output -raw api_base_url)/api/tracker"
  BOOT="$(set -a; source ENVIRONMENT.config; terraform -chdir=infra output -raw bootstrap_admin_password)"
  echo "$TRACKER_API"; echo "password is ${#BOOT} characters"
  ```
  Expected: `https://d1gov8jpsxhwer.cloudfront.net/api/tracker` (yours, 13 Oct) and
  `password is 16 characters`. These variables last only while this terminal is open. In
  a new terminal, run 2.3 again (it works until a local deploy re-points Terraform).

  There are no `<...>` placeholders to type into commands in this checklist: bash reads
  `<` as "read from a file". Anything secret is either loaded from Terraform or typed
  at a hidden prompt.

---

## Part 3: The first-deploy checks (`CLAUDE.md` §7) (15 min)

- [x] **3.1 Health, which also proves the database and the schema (§7 checks 5 and 6)**
  **Result 13 Oct: pass.** `200` in 14 to 16 s from cold (the Lambda log shows 13.3 s of
  it was Aurora waking up; the Lambda's own start took 0.6 s).

  ```sh
  curl -s -w '\n%{http_code} in %{time_total}s\n' $TRACKER_API/health
  ```
  Expected: `{"status": "ok"}` then `200`.

  Every request first connects to Aurora and applies any new migrations, so a 200 here
  also proves three things. Aurora is reachable. Migration `001_init` ran, including
  `CREATE EXTENSION btree_gist`: the migration is all or nothing, so if that line had
  failed you would get a 503. And the first admin `AD000001` exists.

  - `503 "The database is not ready..."`: Aurora is waking from its pause (§7.5). Wait
    30 seconds and retry, up to 3 times.
  - Still 503 after that: get the Lambda's own error message (paste it to Claude):
    ```sh
    (set -a; source ENVIRONMENT.config; aws logs tail /aws/lambda/coding-workshop-tracker-c7dabfc1 --since 10m --format short | tail -40)
    ```

- [x] **3.2 Log in, and time it (§7.4)**
  **Result 13 Oct: pass.** Login 1 took 15.9 s (Aurora waking), logins 2 and 3 took
  1.15 s each. That's slower than the 0.5 s estimate, but under the 1.5 s line.

  Uses `$BOOT` from 2.3; don't set it by hand.

  ```sh
  for i in 1 2 3; do curl -s -o /dev/null -w "login $i: %{http_code} in %{time_total}s\n" \
    -H 'content-type: application/json' -d "{\"username\":\"AD000001\",\"password\":\"$BOOT\"}" \
    $TRACKER_API/auth/login; done
  ```
  Expected: three `200`s. Logins 2 and 3 should take **under about 1.5 s**. (Locally the
  password hashing alone takes 0.25 s; at 512 MB the estimate is about 0.5 s plus network
  time.) Login 1 can be slower: that's a cold start.

  If logins 2 and 3 take over 3 s: tell Claude. The fix is `memory_size = 1024` in
  `infra/lambda.tf`, then deploying again.

- [x] **3.3 The login token survives CloudFront on a GET (§7.3)**
  **Result 13 Oct: pass.** `/auth/me` returned AD000001 and `200`.

  ```sh
  TOKEN=$(curl -s -H 'content-type: application/json' \
    -d "{\"username\":\"AD000001\",\"password\":\"$BOOT\"}" $TRACKER_API/auth/login \
    | python3 -c 'import sys, json; print(json.load(sys.stdin)["token"])')
  curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $TOKEN" $TRACKER_API/auth/me
  ```
  Expected: your user as JSON (`"username": "AD000001"`, `"mustChangePassword": true`),
  then `200`.

  **Fail:** `401` and "Your session is invalid or has expired". That means CloudFront
  dropped the header. To confirm, call the Lambda directly and skip CloudFront:
  ```sh
  LAMBDA=$(set -a; source ENVIRONMENT.config; terraform -chdir=infra output -json lambda_urls \
    | python3 -c 'import sys, json; print(list(json.load(sys.stdin).values())[0].rstrip("/"))')
  curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $TOKEN" $LAMBDA/auth/me
  ```
  If that returns 200, CloudFront is the cause. Tell Claude: the fix is a code change
  (send the token in a custom header as well).

- [x] **3.4 API 404s survive CloudFront (§7.1)**
  **Result 13 Oct: failed, fixed, passed.** The first deploy returned `HTTP/2 403`,
  `server: AmazonS3`, `<Code>AccessDenied</Code>`. The `custom_error_response` block was
  removed from `infra/cloudfront.tf` and deployed again. `/no-such-endpoint-2` then
  returned `404`, `application/json`, `{"error": "No such endpoint."}`.

  ```sh
  curl -s -i $TRACKER_API/no-such-endpoint | head -12
  ```
  Expected: `HTTP/2 404`, `content-type: application/json`, and the body
  `{"error": "No such endpoint."}`.

  **Fail:** `HTTP/2 200` with HTML, or a `403` with XML (`AccessDenied`).
  `infra/cloudfront.tf:42-47` rewrites every 404 into the website's `index.html`, and
  the API is included. Tell Claude: the fix is to remove that block (and later use
  `HashRouter` in React). CloudFront remembers the rewritten answer for 5 minutes
  (`error_caching_min_ttl = 300`), so after a fix, test with a different made-up path.

- [ ] **3.5 Deep links (§7.2): skip for now.** They need the frontend, which isn't
  deployed yet. Claude will come back to this one.

---

## Part 4: Seed, demo and load test against AWS (10 min)

- [x] **4.1 Seed the demo data, and set the admin's real password**

  Pick a new admin password (8 or more characters) and store it somewhere safe outside
  the repo (a password manager). The first line asks for it at a hidden prompt: type it
  and press Enter. Nothing shows while you type; that's normal.

  ```sh
  read -rsp 'New admin password (8+ characters): ' NEWPW; echo; echo "${#NEWPW} characters"
  TRACKER_ADMIN_PASSWORD="$BOOT" TRACKER_NEW_ADMIN_PASSWORD="$NEWPW" python3 tools/demo.py seed
  export TRACKER_ADMIN_PASSWORD="$NEWPW"
  ```
  Expected last line: `Done. Every seeded person's password is Demo-pass-2026. ...`.
  Running it again prints `Already seeded` and changes nothing. From now on the admin's
  password is your new one: `$BOOT` no longer works. If it says
  `must change their password first`, the `$NEWPW` line was empty: run all three lines
  again.

- [x] **4.2 Run the demo. This is also the authenticated 404 check through CloudFront.**

  ```sh
  python3 tools/demo.py demo
  ```
  (It uses `TRACKER_ADMIN_PASSWORD` from 4.1. In a new terminal, run 2.3 first, then
  `read -rsp 'Admin password: ' TRACKER_ADMIN_PASSWORD; echo; export TRACKER_ADMIN_PASSWORD`.)
  Expected:
  - **1, 2 and 7:** Apollo and Zeus marked `AT RISK` with their reasons, Hermes
    `on track`.
  - **3 and 5:** Ben first, at `45/40 h (Apollo 25 h, Zeus 20 h) ... OVER BY 5 h`; Chloe
    marked `OVERTIME`; "Only over-allocated: Ben Okafor".
  - **Under "Trying to break the rules":** every line says `REFUSED as designed`, and
    none says `UNEXPECTED`. The two `[404]` lines (Maria opening Zeus, and a project id
    that doesn't exist) are the 404-not-403 rule working through CloudFront.
  - **Last line:** `5 integrity checks, 0 violations`.

  If any line says `UNEXPECTED`, paste the whole output to Claude.

- [x] **4.3 Load test on real AWS**

  ```sh
  python3 tools/loadtest.py
  python3 tools/loadtest.py --users 25 --seconds 30
  ```
(`tools/loadtest.py` was removed on 14 Oct; the k6 test replaces it: `K6_PROFILE=aws K6_BASE_URL=$TRACKER_API K6_USERNAME=ML662930 K6_PASSWORD=Demo-pass-2026 k6 run tools/k6/load.js`, see `docs/TESTING.md` section 7.)
  Expected: `OK: 0 failed requests` on both. LocalStack failed above 15 users because of
  its own file limit, so this run shows what AWS really does. Aurora is capped at 4 units
  (`infra/rds.tf:26`), so p95 times may rise at 25 users; failures should not. Paste
  both tables to Claude: they go into the README's load-test section.

- [ ] **4.4 Look at the data in the cloud** (optional; good for the demo)

  ```sh
  curl -s -H "Authorization: Bearer $(curl -s -H 'content-type: application/json' \
    -d "{\"username\":\"AD000001\",\"password\":\"$TRACKER_ADMIN_PASSWORD\"}" $TRACKER_API/auth/login \
    | python3 -c 'import sys, json; print(json.load(sys.stdin)["token"])')" \
    "$TRACKER_API/dashboard/allocation?overOnly=true" | python3 -m json.tool | head -40
  ```
  Expected: Ben's row, with `"status": "OVER_ALLOCATED"` and the per-project hours.
  Aurora isn't reachable from outside AWS, so the API is the only window into the cloud
  data. That's by design (`CLAUDE.md` trap 11).

---

## Part 5: Before you leave each evening

- [ ] `git status`, commit, then `git push origin David`. The VDI is wiped after the
  workshop.
- [ ] Leave AWS running. Aurora pauses itself when idle (`min_capacity = 0`), so it costs
  almost nothing. Just warm it up (step 3.1) a minute before any demo.

---

## Results (fill in, then paste to Claude)

| Step | Pass / Fail | Numbers or notes |
| --- | --- | --- |
| 0.3 local suite | | `___ passed` |
| 1.2 CI (Python / Terraform / React) | | |
| 2.2 deploy | pass | first deploy, then a redeploy for the 404 fix (45 s) |
| 3.1 health | pass | `200`, 14 to 16 s cold (Aurora waking) |
| 3.2 login latency | pass | login 2: `1.15 s`, login 3: `1.15 s` (login 1: 15.9 s cold) |
| 3.3 token through CloudFront | pass | `200` |
| 3.4 404 through CloudFront | fail, fixed, pass | `403` S3 XML, then `404` `application/json` |
| 4.1 seed | pass | six accounts, Apollo/Zeus/Hermes, Iris pending, Legacy CRM archived |
| 4.2 demo | pass | no `UNEXPECTED`; 10 refusals as designed; 0 integrity violations |
| 4.3 load test, 10 users | pass | 209 req/s, p95 40–50 ms, 0 failed; login p50 1.1 s |
| 4.3 load test, 25 users | pass, 1 finding | 539 req/s, p95 57–65 ms, 2 of 16,184 with no response; cold starts queued about 1 s each; fixed, redeployed, and 25 cold starts then took 0.17 to 0.30 s each |
