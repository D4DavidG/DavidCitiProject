#!/usr/bin/env bash
# Run every automated check in this repo, one after another, and print a PASS/FAIL table.
#
#   ./tools/test-all.sh
#
# Steps: backend tests (+ coverage), bandit security scan, website tests (+ coverage),
# lint, production build, then the Playwright browser tests if the local stack is up
# (ports 3000 and 3001 listening; start it with ./bin/start-dev.sh).
#
# Browser-test usernames: E2E_MANAGER_USERNAME / E2E_EMPLOYEE_USERNAME if set, otherwise
# looked up in the local database (Maria Lopez and Ana Ruiz from tools/demo.py seed).
# Browser tests always run against the local stack, never AWS. They include pull.spec.js,
# which writes to the local database: a task (archived afterwards), audit rows, and bell
# notifications for Maria and every admin.
# Exit code: 0 if every step that ran passed, 1 otherwise. Takes about 2.5 minutes.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1
LOGS="$(mktemp -d)"
NAMES=()
RESULTS=()
NOTES=()

# record NAME STATUS NOTE: one row of the final table.
record() {
  NAMES+=("$1")
  RESULTS+=("$2")
  NOTES+=("$3")
}

header() {
  printf '\n=== %s ===\n' "$1"
}

# 1. Backend: pytest against the local Postgres, with line coverage of our code.
header "1/6 Backend tests (pytest + coverage)"
if [ -x .venv/bin/pytest ]; then
  .venv/bin/pytest --cov=backend/tracker -q 2>&1 | tee "$LOGS/backend.log" | tail -3
  status=$?
  count="$(grep -Eo '[0-9]+ passed' "$LOGS/backend.log" | tail -1)"
  cover="$(awk '/^TOTAL/ {print $NF}' "$LOGS/backend.log")"
  if [ "$status" -eq 0 ]; then record "Backend tests" PASS "$count, coverage $cover"
  else record "Backend tests" FAIL "see $LOGS/backend.log"; fi
else
  echo "No .venv yet. Run: python3.13 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt"
  record "Backend tests" FAIL "no .venv"
fi

# 2. Bandit: the security scanner CI runs. Our code only, not the vendored psycopg.
header "2/6 Security scan (bandit)"
if [ -x .venv/bin/bandit ]; then
  .venv/bin/bandit -q -r backend/tracker \
    -x backend/tracker/psycopg,backend/tracker/psycopg_binary,backend/tracker/psycopg_binary.libs \
    2>&1 | tee "$LOGS/bandit.log" | tail -15
  if [ "${PIPESTATUS[0]}" -eq 0 ]; then record "Bandit" PASS "no issues"
  else record "Bandit" FAIL "see $LOGS/bandit.log"; fi
else
  echo "bandit is not installed. Run: .venv/bin/pip install bandit"
  record "Bandit" FAIL "not installed"
fi

# 3. Website: Vitest + React Testing Library. Coverage mode runs every test too.
header "3/6 Website tests (Vitest + coverage)"
# NO_COLOR: Vitest colours its summary even into a file, which hid the count from grep.
(cd frontend && NO_COLOR=1 npm run test:coverage) > "$LOGS/frontend.log" 2>&1
status=$?
grep -E '^ +(Test Files|Tests) |^(Statements|Branches|Functions|Lines) ' "$LOGS/frontend.log"
count="$(grep -E '^ +Tests ' "$LOGS/frontend.log" | grep -Eo '[0-9]+ passed' | head -1)"
lines="$(grep -E '^Lines ' "$LOGS/frontend.log" | grep -Eo '[0-9.]+%' | head -1)"
if [ "$status" -eq 0 ]; then record "Website tests" PASS "$count, lines $lines"
else record "Website tests" FAIL "see $LOGS/frontend.log"; fi

# 4. Lint: ESLint on the website code.
header "4/6 Lint (ESLint)"
(cd frontend && npm run lint) > "$LOGS/lint.log" 2>&1
status=$?
tail -5 "$LOGS/lint.log"
if [ "$status" -eq 0 ]; then record "Lint" PASS "clean"
else record "Lint" FAIL "see $LOGS/lint.log"; fi

# 5. Build: the same production build deploy-frontend.sh makes (into frontend/dist).
header "5/6 Production build (vite build)"
(cd frontend && npm run build) > "$LOGS/build.log" 2>&1
status=$?
grep -E 'built in|error' "$LOGS/build.log" | tail -3
if [ "$status" -eq 0 ]; then record "Build" PASS "frontend/dist"
else record "Build" FAIL "see $LOGS/build.log"; fi

# 6. Playwright: a real Chromium against the running local stack.
header "6/6 Browser tests (Playwright)"
listening() { ss -ltn | grep -qE "[:.]$1[[:space:]]"; }
if listening 3000 && listening 3001; then
  lookup() {
    PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -At \
      -c "SELECT username FROM users WHERE email = '$1' AND NOT is_archived" 2>/dev/null
  }
  manager="${E2E_MANAGER_USERNAME:-$(lookup maria.lopez@acme.test)}"
  employee="${E2E_EMPLOYEE_USERNAME:-$(lookup ana.ruiz@acme.test)}"
  if [ -n "$manager" ] && [ -n "$employee" ]; then
    echo "Manager $manager, employee $employee"
    tour="$(mktemp -d)"  # the screen tour's screenshots; outside the repo, never committed
    # Pin both URLs to the local stack: pull.spec.js writes data, so an E2E_BASE_URL
    # left exported from an AWS run must never send it to the live site.
    (cd frontend && E2E_BASE_URL=http://localhost:3000 E2E_API=http://localhost:3001/api/tracker \
      E2E_MANAGER_USERNAME="$manager" E2E_EMPLOYEE_USERNAME="$employee" \
      E2E_TOUR_DIR="$tour" npx playwright test --reporter=list) > "$LOGS/e2e.log" 2>&1
    status=$?
    tail -6 "$LOGS/e2e.log"
    passed="$(grep -Eo '[0-9]+ passed' "$LOGS/e2e.log" | tail -1)"
    skipped="$(grep -Eo '[0-9]+ skipped' "$LOGS/e2e.log" | tail -1)"
    if [ "$status" -eq 0 ]; then record "Browser tests" PASS "$passed${skipped:+, $skipped}; screenshots in $tour"
    else record "Browser tests" FAIL "see $LOGS/e2e.log"; fi
  else
    echo "Seeded users not found in the local database. Run tools/demo.py seed, or set"
    echo "E2E_MANAGER_USERNAME and E2E_EMPLOYEE_USERNAME."
    record "Browser tests" FAIL "no seeded users"
  fi
else
  echo "Skipped: the local stack is not running (need ports 3000 and 3001)."
  echo "Start it with ./bin/start-dev.sh in another terminal, then rerun this script."
  record "Browser tests" SKIP "local stack not running"
fi

# Summary.
printf '\n=== Summary ===\n'
printf '%-15s %-6s %s\n' "Step" "Result" "Detail"
failed=0
for i in "${!NAMES[@]}"; do
  printf '%-15s %-6s %s\n' "${NAMES[$i]}" "${RESULTS[$i]}" "${NOTES[$i]}"
  [ "${RESULTS[$i]}" = FAIL ] && failed=1
done
echo "Full logs: $LOGS"
exit "$failed"
