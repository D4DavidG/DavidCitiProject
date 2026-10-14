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
  the repo. Placeholders below look like `<this>`.
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

- [ ] **1.1 Push the branch**

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

- [ ] **2.1 Load your variables and check them**

  ```sh
  source ~/.bashrc
  echo "$AWS_REGION $PARTICIPANT_ID"
  ```
  Expected: `us-east-2 c7dabfc1`.

- [ ] **2.2 Deploy**

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

- [ ] **2.3 Save the URL and the first admin password** (run this right after 2.2: a
  later local `start-dev.sh` switches Terraform back to LocalStack)

  ```sh
  (set -a; source ENVIRONMENT.config; terraform -chdir=infra output -raw api_base_url; echo; \
   terraform -chdir=infra output -raw bootstrap_admin_password; echo)
  ```
  Expected: two lines, `https://dxxxxxxxxxxxx.cloudfront.net` and a 16-character
  password. Keep the password out of the repo (a password manager, or a file in
  `private/`).

  ```sh
  export TRACKER_API=https://<dxxxxxxxxxxxx.cloudfront.net>/api/tracker
  ```

---

## Part 3: The first-deploy checks (`CLAUDE.md` §7) (15 min)

- [ ] **3.1 Health, which also proves the database and the schema (§7 checks 5 and 6)**

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

- [ ] **3.2 Log in, and time it (§7.4)**

  ```sh
  BOOT='<bootstrap password from 2.3>'
  for i in 1 2 3; do curl -s -o /dev/null -w "login $i: %{http_code} in %{time_total}s\n" \
    -H 'content-type: application/json' -d "{\"username\":\"AD000001\",\"password\":\"$BOOT\"}" \
    $TRACKER_API/auth/login; done
  ```
  Expected: three `200`s. Logins 2 and 3 should take **under about 1.5 s**. (Locally the
  password hashing alone takes 0.25 s; at 512 MB the estimate is about 0.5 s plus network
  time.) Login 1 can be slower: that's a cold start.

  If logins 2 and 3 take over 3 s: tell Claude. The fix is `memory_size = 1024` in
  `infra/lambda.tf`, then deploying again.

- [ ] **3.3 The login token survives CloudFront on a GET (§7.3)**

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
  (set -a; source ENVIRONMENT.config; terraform -chdir=infra output lambda_urls)
  curl -s -w '\n%{http_code}\n' -H "Authorization: Bearer $TOKEN" <lambda url>/auth/me
  ```
  If that returns 200, CloudFront is the cause. Tell Claude: the fix is a code change
  (send the token in a custom header as well).

- [ ] **3.4 API 404s survive CloudFront (§7.1)**

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

- [ ] **4.1 Seed the demo data, and set the admin's real password**

  Pick a new admin password (8 or more characters) and store it with the other one.

  ```sh
  TRACKER_ADMIN_PASSWORD="$BOOT" TRACKER_NEW_ADMIN_PASSWORD='<your new admin password>' \
    python3 tools/demo.py seed
  ```
  Expected last line: `Done. Every seeded person's password is Demo-pass-2026. ...`.
  Running it again prints `Already seeded` and changes nothing. From now on the admin's
  password is your new one: `$BOOT` no longer works.

- [ ] **4.2 Run the demo. This is also the authenticated 404 check through CloudFront.**

  ```sh
  export TRACKER_ADMIN_PASSWORD='<your new admin password>'
  python3 tools/demo.py demo
  ```
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

- [ ] **4.3 Load test on real AWS**

  ```sh
  python3 tools/loadtest.py
  python3 tools/loadtest.py --users 25 --seconds 30
  ```
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
| 2.2 deploy | | minutes taken: |
| 3.1 health | | first-try status, then time: |
| 3.2 login latency | | login 2: `__ s`, login 3: `__ s` |
| 3.3 token through CloudFront | | status: |
| 3.4 404 through CloudFront | | status and content-type: |
| 4.1 seed | | |
| 4.2 demo | | any `UNEXPECTED`? integrity violations: |
| 4.3 load test, 10 users | | req/s, p95, failed |
| 4.3 load test, 25 users | | req/s, p95, failed |
