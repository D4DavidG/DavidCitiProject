#!/usr/bin/env bash
# Run the Playwright browser tests yourself: one command, on the local stack or the live AWS site.
#
#   ./tools/e2e.sh                 # every browser test, on the local stack
#   ./tools/e2e.sh demo            # one file (names are Playwright's filters)
#   ./tools/e2e.sh --show demo     # a real browser window, slowed down so people can watch
#   ./tools/e2e.sh --aws demo tour # against the live AWS site; read-only files only
#   ./tools/e2e.sh --report demo   # then open Playwright's HTML report
#   ./tools/e2e.sh --list          # list the tests without running them (needs no server)
#
# Options:  --show (visible browser, 500 ms between steps; E2E_SLOWMO=250 changes the speed)
#           --aws (the live site)   --report (HTML report afterwards)   --list   -h / --help
# Files:    name any part of a file name below; a word that matches several runs them all
#           ("time" runs timeline and timelog). Several names are fine: ./tools/e2e.sh demo tour
#   demo       the seven questions, then the phone menu            read-only
#   tour       every screen, desktop and phone, axe accessibility   read-only
#   history    a manager reads a person's history                   read-only
#   schedule   the Schedule bars                                    read-only
#   timeline budget workload   the three charts                     read-only
#   pull       Ana takes a task and puts it back                    WRITES data
#   requests   Ana asks, Maria rejects                              WRITES data
#   timelog    Ben logs time, Maria approves                        WRITES data
#   project-lifecycle   an admin creates, edits, archives, reactivates   WRITES data
#   screenshots   rewrites docs/screenshots (needs E2E_SCREENSHOTS=1)    changes repo files
# Local:    needs ./bin/start-dev.sh running (ports 3000 and 3001) and the demo data seeded.
#           Maria's, Ana's and Sam's usernames are looked up in the local database, as
#           tools/test-all.sh does. The admin password comes only from E2E_ADMIN_PASSWORD;
#           without it project-lifecycle skips. The files that write add rows to the local database.
# AWS:      runs only the read-only files (none named: all seven). A file that writes is
#           refused. Seen passing on AWS on 14 Oct night: demo, history, schedule, tour.
#           Not yet run there: timeline, budget, workload.
#           The site is warmed first (the database sleeps when idle).
# Screens:  the tour saves its screenshots in E2E_TOUR_DIR (default $HOME/tour-shots).
# Exit:     0 all passed, 1 a test failed or Playwright could not run, 2 bad request.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$ROOT/frontend"

# The live site and its three demo usernames (docs/DEMO-RUNBOOK.md). Edit here if AWS is reseeded.
AWS_SITE="https://d1gov8jpsxhwer.cloudfront.net"
AWS_MANAGER="ML662930"   # Maria Lopez
AWS_EMPLOYEE="AR553882"  # Ana Ruiz
AWS_ZEUS="SP918535"      # Sam Patel

# Which files only read. Anything not named here counts as one that writes.
READ_ONLY="demo history schedule tour timeline budget workload"

usage() { sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed -e '/^$/d' -e 's/^# \{0,1\}//'; }
err() { printf '%s\n' "$*" >&2; }

# Why a file may not run against the live site (shown when it is refused).
why_not_aws() {
  case "$1" in
    pull) echo "makes a task and sends bell notifications to Maria and every admin" ;;
    requests) echo "sends a request and rejects it, with audit rows and bell notifications" ;;
    timelog) echo "logs and approves 15 minutes of time, which counts against Apollo's budget" ;;
    project-lifecycle) echo "creates a project and leaves it archived" ;;
    screenshots) echo "rewrites the pictures in docs/screenshots (it changes repo files)" ;;
    *) echo "is not on this script's read-only list, so it is treated as one that writes" ;;
  esac
}

is_read_only() { case " $READ_ONLY " in *" $1 "*) return 0 ;; esac; return 1; }

# ---- Options and file names ------------------------------------------------------------

SHOW=0 AWS=0 REPORT=0 LIST=0
NAMED=()
for arg in "$@"; do
  case "$arg" in
    -h|--help) usage; exit 0 ;;
    --show) SHOW=1 ;;
    --aws) AWS=1 ;;
    --report) REPORT=1 ;;
    --list) LIST=1 ;;
    -*) err "Unknown option: $arg"; err "Try: ./tools/e2e.sh --help"; exit 2 ;;
    *) NAMED+=("$arg") ;;
  esac
done

if [ ! -x "$FRONTEND/node_modules/.bin/playwright" ]; then
  err "Playwright is not installed here. Run:"
  err "  cd $FRONTEND && npm ci && npx playwright install chromium"
  exit 1
fi

if [ "$SHOW" -eq 1 ] && [ "$LIST" -eq 0 ] && [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  err "--show needs a screen to open the browser on, and this shell has none (DISPLAY is empty)."
  err "Run it from a terminal on the VDI's desktop, or leave out --show."
  exit 1
fi

# Every spec file's short name (demo, tour, ...). The names are matched here, against the file
# names only: Playwright's own filter matches anywhere in the full path, so "project" alone would
# match this repo's folder name too.
ALL=()
for file in "$FRONTEND"/e2e/*.spec.js; do ALL+=("$(basename "$file" .spec.js)"); done

SELECTED=()
for word in ${NAMED[@]+"${NAMED[@]}"}; do
  pattern="${word#frontend/}"; pattern="${pattern#e2e/}"; pattern="${pattern%.spec.js}"
  [ -n "$pattern" ] || continue
  hits=()
  for name in "${ALL[@]}"; do
    if [[ "$name" =~ $pattern ]]; then hits+=("$name"); fi
  done
  if [ "${#hits[@]}" -eq 0 ]; then
    err "No test file matches '$word'. The files are: ${ALL[*]}"
    exit 2
  fi
  [ "${#hits[@]}" -gt 1 ] && echo "Note: '$word' matches ${hits[*]}; all of them will run."
  for name in "${hits[@]}"; do
    case " ${SELECTED[*]-} " in *" $name "*) ;; *) SELECTED+=("$name") ;; esac
  done
done

# Against the live site only files that read. Refuse the whole request, before anything runs.
if [ "$AWS" -eq 1 ]; then
  refused=0
  for name in ${SELECTED[@]+"${SELECTED[@]}"}; do
    if ! is_read_only "$name"; then
      err "Refused: $name.spec.js $(why_not_aws "$name"). It is never run against the live site."
      refused=1
    fi
  done
  if [ "$refused" -eq 1 ]; then
    err "Against AWS this script runs only the read-only files: $READ_ONLY."
    err "To run the others, use the local stack (leave out --aws)."
    exit 2
  fi
  if [ "${#SELECTED[@]}" -eq 0 ]; then
    for name in "${ALL[@]}"; do is_read_only "$name" && SELECTED+=("$name"); done
  fi
fi

# What will run: the chosen files, or (local, none chosen) all of them.
if [ "${#SELECTED[@]}" -gt 0 ]; then RUNSET=("${SELECTED[@]}"); else RUNSET=("${ALL[@]}"); fi
in_run() { case " ${RUNSET[*]} " in *" $1 "*) return 0 ;; esac; return 1; }

# ---- Where to point the tests, and who signs in -----------------------------------------

export E2E_TOUR_DIR="${E2E_TOUR_DIR:-$HOME/tour-shots}"
in_run screenshots || unset E2E_SCREENSHOTS   # it rewrites repo files: only when it is named
NOTES=()  # variables we could not fill; they explain skipped tests at the end

if [ "$AWS" -eq 1 ]; then
  TARGET="the live AWS site $AWS_SITE"
  export E2E_BASE_URL="$AWS_SITE" E2E_API="$AWS_SITE/api/tracker"
  export E2E_MANAGER_USERNAME="$AWS_MANAGER" E2E_EMPLOYEE_USERNAME="$AWS_EMPLOYEE" E2E_ZEUS_MANAGER_USERNAME="$AWS_ZEUS"
  unset E2E_ADMIN_PASSWORD   # a local admin password must never be sent to the live site
else
  TARGET="the local stack http://localhost:3000"
  # Pinned, as tools/test-all.sh does: a leftover AWS address in the shell must not send writing tests to the live site.
  export E2E_BASE_URL="http://localhost:3000" E2E_API="http://localhost:3001/api/tracker"
fi

if [ "$LIST" -eq 0 ]; then
  if [ "$AWS" -eq 1 ]; then
    echo "Warming up the live site (the database sleeps when idle; the first answer can take 15 s)..."
    code=000
    for attempt in 1 2 3 4; do
      code="$(curl -s -m 90 -o /dev/null -w '%{http_code}' "$E2E_API/health")"
      [ "$code" = 200 ] && break
      echo "  try $attempt: the health check answered $code; waiting 10 s"
      sleep 10
    done
    if [ "$code" != 200 ]; then
      err "The live site did not answer $E2E_API/health with 200 (last answer: $code)."
      err "Check the address and your network, wait a minute and try again. Plan B: the local stack (leave out --aws)."
      exit 1
    fi
    echo "  the site is awake."
  else
    listening() { ss -ltn | grep -qE "[:.]$1[[:space:]]"; }
    down=""
    listening 3000 || down="3000 (the website)"
    listening 3001 || down="${down:+$down and }3001 (the API proxy)"
    if [ -n "$down" ]; then
      err "The local stack is not running: nothing is listening on port $down."
      err "Start it in another terminal, wait for 'All Components Verified!', then run this again:"
      err "  cd $ROOT && source ~/.bashrc && ./bin/start-dev.sh"
      err "(Or test the live site instead: ./tools/e2e.sh --aws demo)"
      exit 1
    fi
    lookup() {
      PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -At \
        -c "SELECT username FROM users WHERE email = '$1' AND NOT is_archived" 2>/dev/null
    }
    manager="${E2E_MANAGER_USERNAME:-$(lookup maria.lopez@acme.test)}"
    employee="${E2E_EMPLOYEE_USERNAME:-$(lookup ana.ruiz@acme.test)}"
    zeus="${E2E_ZEUS_MANAGER_USERNAME:-$(lookup sam.patel@acme.test)}"
    if [ -z "$manager" ] || [ -z "$employee" ]; then
      err "Could not find Maria Lopez and Ana Ruiz in the local database."
      err "Seed it once: TRACKER_ADMIN_PASSWORD=... python3 tools/demo.py seed"
      err "or set E2E_MANAGER_USERNAME and E2E_EMPLOYEE_USERNAME yourself."
      exit 1
    fi
    [ -n "$zeus" ] || NOTES+=("E2E_ZEUS_MANAGER_USERNAME: Sam Patel was not found in the local database (timeline.spec.js needs him)")
    export E2E_MANAGER_USERNAME="$manager" E2E_EMPLOYEE_USERNAME="$employee" E2E_ZEUS_MANAGER_USERNAME="$zeus"
    if in_run project-lifecycle && [ -z "${E2E_ADMIN_PASSWORD:-}" ]; then
      echo "Note: E2E_ADMIN_PASSWORD is not set, so the admin-only test (project-lifecycle) will skip."
    fi
  fi
  mkdir -p "$E2E_TOUR_DIR"
fi

# ---- Build the Playwright command ------------------------------------------------------

args=(playwright test)
for name in ${SELECTED[@]+"${SELECTED[@]}"}; do args+=("e2e/$name.spec.js"); done
if [ "$LIST" -eq 1 ]; then
  args+=(--list --reporter=list)
else
  if [ "$REPORT" -eq 1 ]; then
    args+=("--reporter=list,html")
    export PLAYWRIGHT_HTML_OPEN=never   # we open the report ourselves, after the summary
  else
    args+=(--reporter=list)
  fi
  if [ "$SHOW" -eq 1 ]; then
    export E2E_SLOWMO="${E2E_SLOWMO:-500}"
    args+=(--headed --timeout=600000)   # the slowed-down steps would otherwise run past the 2-minute limit
    [ "${#SELECTED[@]}" -eq 0 ] && echo "Tip: --show is slow on purpose. For a live moment pick one file, e.g. ./tools/e2e.sh --show demo"
  fi
fi

if [ "$LIST" -eq 0 ]; then
  echo
  echo "Target : $TARGET"
  echo "Files  : $( [ "${#SELECTED[@]}" -gt 0 ] && echo "${SELECTED[*]}" || echo "all ${#ALL[@]}" )"
  echo "Users  : manager $E2E_MANAGER_USERNAME, employee $E2E_EMPLOYEE_USERNAME, Zeus manager ${E2E_ZEUS_MANAGER_USERNAME:-(none)}"
  echo "Mode   : $( [ "$SHOW" -eq 1 ] && echo "a visible browser, $E2E_SLOWMO ms between steps" || echo "headless (add --show to watch)" )"
  if [ "$AWS" -eq 0 ] && [ "${#SELECTED[@]}" -eq 0 ]; then
    echo "Note   : this includes the files that write data (pull, requests, timelog, project-lifecycle): they add rows to the local database."
  fi
  echo
fi

# ---- Run -------------------------------------------------------------------------------

LOG="$(mktemp -t e2e-XXXXXX.log)"
[ -t 1 ] && export FORCE_COLOR=1   # keep Playwright's colours even though the output goes through tee
cd "$FRONTEND" || exit 1
SECONDS=0
npx "${args[@]}" 2>&1 | tee "$LOG"
status="${PIPESTATUS[0]}"

if [ "$LIST" -eq 1 ]; then
  echo
  echo "Nothing was run. Run one file with: ./tools/e2e.sh demo"
  exit "$status"
fi

# ---- What the result means -------------------------------------------------------------

CLEAN="$(sed 's/\x1b\[[0-9;]*m//g' "$LOG")"
tests() { if [ "$1" -eq 1 ]; then echo "1 test"; else echo "$1 tests"; fi; }
count() { printf '%s\n' "$CLEAN" | grep -E "^ *[0-9]+ $1" | tail -1 | grep -Eo '[0-9]+' | head -1; }
passed="$(count passed)"; failed="$(count failed)"; skipped="$(count skipped)"
passed="${passed:-0}"; failed="${failed:-0}"; skipped="${skipped:-0}"

echo
echo "=== What this means (took ${SECONDS} s, on $TARGET) ==="
if [ "$status" -eq 0 ] && [ "$passed" -gt 0 ]; then
  echo "PASSED: $(tests "$passed") passed. In a real browser, the app did what each test expects."
elif [ "$failed" -gt 0 ]; then
  echo "FAILED: $(tests "$failed") failed. Read the error above this block: it names the file, the line and what was expected."
  traces="$(find "$FRONTEND/test-results" -name trace.zip 2>/dev/null | head -3)"
  if [ -n "$traces" ]; then
    echo "Each failed test kept a recording of every step (a trace). To watch the first one:"
    first="${traces%%$'\n'*}"
    echo "  cd $FRONTEND && npx playwright show-trace ${first#"$FRONTEND"/}"
    echo "(The folder is emptied at the start of every run, so open the trace before you run again.)"
  fi
elif [ "$status" -eq 0 ]; then
  echo "NOTHING RAN: every test was skipped (see below)."
else
  echo "COULD NOT RUN: Playwright stopped before any test finished. The first error above says why."
  if printf '%s\n' "$CLEAN" | grep -q "Executable doesn't exist"; then
    echo "The browser is missing. Install it: cd $FRONTEND && npx playwright install chromium"
  fi
fi

if [ "$skipped" -gt 0 ]; then
  echo "SKIPPED: $(tests "$skipped"). A skip is not a failure: the test did not have what it needs."
  in_run project-lifecycle && [ -z "${E2E_ADMIN_PASSWORD:-}" ] &&
    echo "  - project-lifecycle.spec.js: set E2E_ADMIN_PASSWORD (the local AD000001 password)"
  in_run screenshots && [ -z "${E2E_SCREENSHOTS:-}" ] &&
    echo "  - screenshots.spec.js: runs only with E2E_SCREENSHOTS=1 (off on purpose: it rewrites docs/screenshots)"
  for note in ${NOTES[@]+"${NOTES[@]}"}; do echo "  - $note"; done
fi
echo "Full output: $LOG"

if [ "$REPORT" -eq 1 ]; then
  echo
  echo "Opening Playwright's report (http://localhost:9323). Press Ctrl+C here when you are done."
  npx playwright show-report
fi

exit "$status"
