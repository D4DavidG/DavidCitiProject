#!/usr/bin/env bash
# Run the Playwright browser tests yourself: one command, on the local stack or the live AWS site.
#
#   ./tools/e2e.sh                 # every browser test, on the local stack
#   ./tools/e2e.sh demo            # one file (any part of a spec file name)
#   ./tools/e2e.sh --show demo     # a real browser window, slowed down so people can watch
#   ./tools/e2e.sh --aws           # the live AWS site: the four read-only files seen passing there
#   ./tools/e2e.sh --aws demo tour # the live AWS site, just those; read-only files only
#   ./tools/e2e.sh --report demo   # then open Playwright's HTML report
#   ./tools/e2e.sh --video demo    # record every test as a video, then open the report that plays them
#   ./tools/e2e.sh --aws --video history   # the same on the live site
#   ./tools/e2e.sh --ui            # Playwright's UI mode: pick a test, watch it, replay each step
#   ./tools/e2e.sh --aws --allow-writes timelog   # a file that adds data, on the live site (warns first)
#   ./tools/e2e.sh --aws demo -- --headed         # anything after -- goes to "playwright test" as it is
#   ./tools/e2e.sh --list          # list the tests without running them (needs no server)
#
# Options:  --show (visible browser, 500 ms between steps; E2E_SLOWMO=250 changes the speed)
#           --video (record every test; the videos are copied to E2E_VIDEO_DIR, default
#             $HOME/e2e-videos, and the HTML report plays each test's video; with or without --show)
#           --ui (Playwright's UI mode: a window that lists the tests; run, watch and replay them.
#             Needs a screen. Not with --list, --report or --video)
#           --aws (the live site)   --allow-writes (with --aws only: lets the files that add data run
#             there, after a warning and a 5-second pause; every run adds rows that stay for good)
#           --report (HTML report afterwards)   --list   -h / --help
#           -- (everything after it goes to "playwright test" unchanged, e.g. --headed or --grep phone)
# Files:    name any part of a file name below; a word that matches several runs them all
#           ("time" runs timeline and timelog). Several names are fine: ./tools/e2e.sh demo tour
#   demo       the seven questions, then the phone menu            read-only
#   tour       every screen, desktop and phone, light and dark, axe  read-only
#   history    a manager reads a person's history                   read-only
#   schedule   the Schedule bars                                    read-only
#   search     the top bar's search jumps to a page and a project   read-only
#   archive-warning   an admin opens Archive for the employee, sees the warning, cancels   read-only
#   timeline budget workload   the three charts                     read-only
#   pull       the employee takes a task and puts it back           WRITES data
#   requests   the employee asks, Maria rejects                     WRITES data
#   timelog    Ben logs time, Maria approves                        WRITES data
#   project-lifecycle   an admin creates, edits, archives, reactivates   WRITES data
#   screenshots   rewrites docs/screenshots (needs E2E_SCREENSHOTS=1)    changes repo files
# Users:    the manager is Maria Lopez and the employee Ana Ruiz locally (looked up in the local
#           database, as tools/test-all.sh does); on the live site the employee is Ben Okafor,
#           because Ana Ruiz was archived there in the 15 Oct demo. Every demo password is
#           Demo-pass-2026. The specs read the employee's name from E2E_EMPLOYEE_NAME.
# Local:    needs ./bin/start-dev.sh running (ports 3000 and 3001) and the demo data seeded.
#           The admin password comes only from E2E_ADMIN_PASSWORD; without it project-lifecycle
#           skips. The files that write add rows to the local database.
# AWS:      runs only the read-only files. A file that writes is refused, unless you add
#           --allow-writes (screenshots never runs there). E2E_ADMIN_PASSWORD defaults to the live
#           admin's published password (gusmao123). With no name it runs the six seen passing
#           on the live site after the 15 Oct post-demo deploy (20 tests, 16:35): demo, history,
#           schedule, tour, search, archive-warning. timeline, budget and workload only read too,
#           so you may name them: on 15 Oct budget passed 3 of 3 there, workload 5 of 5 and
#           timeline 3 of 4 (its "Design Done" test fails there because the live data moved on:
#           Apollo's Design is Late, 21% done; not a code fault). They stay out of the default.
#           The site is warmed first (the database sleeps when idle).
# Screens:  the tour saves its screenshots in E2E_TOUR_DIR (default $HOME/tour-shots).
# Guide:    docs/TESTING.md (what each test checks, where it runs and why).
# Exit:     0 all passed, 1 a test failed or Playwright could not run, 2 bad request.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$ROOT/frontend"

# The live site and its demo usernames (docs/TESTING.md). Edit here if AWS is reseeded.
AWS_SITE="https://d1gov8jpsxhwer.cloudfront.net"
AWS_MANAGER="ML662930"   # Maria Lopez
AWS_EMPLOYEE="BO435681"  # Ben Okafor, Maria's report (Ana Ruiz, AR553882, was archived in the 15 Oct demo)
AWS_EMPLOYEE_NAME="Ben Okafor"
AWS_ZEUS="SP918535"      # Sam Patel
AWS_ADMIN_PASSWORD="gusmao123"  # AD000001 on the live site (David published it): E2E_ADMIN_PASSWORD's default with --aws

# Which files only read. Anything not named here counts as one that writes.
READ_ONLY="demo history schedule tour timeline budget workload search archive-warning"
# What --aws runs when no file is named: the files seen passing on the live site after the
# 15 Oct post-demo deploy (20 tests). The three chart files run there only when named
# (timeline's "Design Done" test expects the seed's data).
AWS_DEFAULT="demo history schedule tour search archive-warning"

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

SHOW=0 AWS=0 REPORT=0 LIST=0 VIDEO=0 UI=0 WRITES=0
NAMED=()
PASS=()  # everything after "--", handed to "playwright test" unchanged
while [ "$#" -gt 0 ]; do
  case "$1" in
    --) shift; PASS=("$@"); break ;;
    -h|--help) usage; exit 0 ;;
    --show) SHOW=1 ;;
    --aws) AWS=1 ;;
    --report) REPORT=1 ;;
    --list) LIST=1 ;;
    --video) VIDEO=1 ;;
    --ui) UI=1 ;;
    --allow-writes) WRITES=1 ;;
    -*) err "Unknown option: $1"; err "Try: ./tools/e2e.sh --help (Playwright's own options go after --)"; exit 2 ;;
    *) NAMED+=("$1") ;;
  esac
  shift
done

if [ "$WRITES" -eq 1 ] && [ "$AWS" -eq 0 ]; then
  err "--allow-writes goes with --aws only: on the local stack every file may already add data."
  err "Try: ./tools/e2e.sh --aws --allow-writes timelog"
  exit 2
fi
if [ "$UI" -eq 1 ] && [ $((LIST + REPORT + VIDEO)) -gt 0 ]; then
  err "--ui does not go with --list, --report or --video: UI mode lists the tests, runs them and replays every step itself."
  exit 2
fi

if [ ! -x "$FRONTEND/node_modules/.bin/playwright" ]; then
  err "Playwright is not installed here. Run:"
  err "  cd $FRONTEND && npm ci && npx playwright install chromium"
  exit 1
fi

if [ "$SHOW" -eq 1 ] && [ "$LIST" -eq 0 ] && [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  err "--show needs a screen to open the browser on, and this shell has none (DISPLAY is empty)."
  err "Run it from a terminal on the VDI's desktop, or leave out --show (--video records a video you can watch later)."
  exit 1
fi
if [ "$UI" -eq 1 ] && [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  err "--ui opens a window, and this shell has no screen to open it on (DISPLAY is empty)."
  err "Run it from a terminal on the VDI's desktop, or use --video and watch the videos afterwards."
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

# Against the live site only files that read, unless --allow-writes. Refuse the whole request,
# before anything runs.
WRITERS=()  # the files that will add data to the live site (--allow-writes only)
if [ "$AWS" -eq 1 ]; then
  refused=0
  for name in ${SELECTED[@]+"${SELECTED[@]}"}; do
    is_read_only "$name" && continue
    if [ "$WRITES" -eq 1 ] && [ "$name" != screenshots ]; then WRITERS+=("$name"); continue; fi
    if [ "$name" = screenshots ]; then
      err "Refused: screenshots.spec.js $(why_not_aws screenshots). It never runs against the live site."
    else
      err "Refused: $name.spec.js $(why_not_aws "$name"). Without --allow-writes it never runs against the live site."
    fi
    refused=1
  done
  if [ "$refused" -eq 1 ]; then
    err "Against AWS this script runs only the read-only files: $READ_ONLY."
    err "To run the others, use the local stack (leave out --aws), or add --allow-writes to add their"
    err "data to the live site for good: ./tools/e2e.sh --aws --allow-writes NAME"
    exit 2
  fi
  if [ "$WRITES" -eq 1 ] && [ "${#SELECTED[@]}" -eq 0 ] && [ "$UI" -eq 0 ]; then
    err "--allow-writes needs the files named, so nothing writes to the live site by accident."
    err "For example: ./tools/e2e.sh --aws --allow-writes timelog   (the files that write: pull requests timelog project-lifecycle)"
    exit 2
  fi
  if [ "${#SELECTED[@]}" -eq 0 ] && [ "$UI" -eq 1 ]; then
    # UI mode lists the files it is given: every read-only one (plus those that write, with --allow-writes).
    for name in "${ALL[@]}"; do
      if is_read_only "$name"; then SELECTED+=("$name")
      elif [ "$WRITES" -eq 1 ] && [ "$name" != screenshots ]; then SELECTED+=("$name"); WRITERS+=("$name"); fi
    done
  elif [ "${#SELECTED[@]}" -eq 0 ]; then
    for name in "${ALL[@]}"; do case " $AWS_DEFAULT " in *" $name "*) SELECTED+=("$name") ;; esac; done
  fi
  for name in ${SELECTED[@]+"${SELECTED[@]}"}; do
    case "$name" in
      timeline) echo "Note: on the live site timeline.spec.js's \"Design Done\" test fails: the live data moved on (Apollo's Design is no longer Done)." ;;
    esac
  done
fi

# What will run: the chosen files, or (local, none chosen) all of them.
if [ "${#SELECTED[@]}" -gt 0 ]; then RUNSET=("${SELECTED[@]}"); else RUNSET=("${ALL[@]}"); fi
in_run() { case " ${RUNSET[*]} " in *" $1 "*) return 0 ;; esac; return 1; }

# ---- Where to point the tests, and who signs in -----------------------------------------

export E2E_TOUR_DIR="${E2E_TOUR_DIR:-$HOME/tour-shots}"
# It rewrites repo files, so only when it is named (a run with no names does not count).
case " ${SELECTED[*]-} " in *" screenshots "*) ;; *) unset E2E_SCREENSHOTS ;; esac
NOTES=()  # variables we could not fill; they explain skipped tests at the end

# The files that write skip themselves on the live site unless this is 1 (frontend/e2e/people.js),
# so it is set here and only here, after the warning below; a value left in the shell never counts.
unset E2E_ALLOW_WRITES
if [ "$AWS" -eq 1 ]; then
  TARGET="the live AWS site $AWS_SITE"
  export E2E_BASE_URL="$AWS_SITE" E2E_API="$AWS_SITE/api/tracker"
  export E2E_MANAGER_USERNAME="$AWS_MANAGER" E2E_EMPLOYEE_USERNAME="$AWS_EMPLOYEE" E2E_ZEUS_MANAGER_USERNAME="$AWS_ZEUS"
  export E2E_EMPLOYEE_NAME="$AWS_EMPLOYEE_NAME"
  # The live admin's published password, unless you set E2E_ADMIN_PASSWORD yourself. Only the files
  # that need an admin use it: archive-warning (read-only: it cancels) and project-lifecycle (which
  # needs --allow-writes there).
  export E2E_ADMIN_PASSWORD="${E2E_ADMIN_PASSWORD:-$AWS_ADMIN_PASSWORD}"
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
    # The employee's name as the website shows it, so no spec assumes who the employee is.
    name_of() {
      [[ "$1" =~ ^[A-Za-z0-9]+$ ]] || return 0   # a username is letters and digits only
      PGPASSWORD=postgres123 psql -h localhost -U postgres -d postgres -At \
        -c "SELECT first_name || ' ' || last_name FROM users WHERE username = '$1'" 2>/dev/null
    }
    employee_name="${E2E_EMPLOYEE_NAME:-$(name_of "$employee")}"
    export E2E_MANAGER_USERNAME="$manager" E2E_EMPLOYEE_USERNAME="$employee" E2E_ZEUS_MANAGER_USERNAME="$zeus"
    if [ -n "$employee_name" ]; then export E2E_EMPLOYEE_NAME="$employee_name"; else unset E2E_EMPLOYEE_NAME; fi
    if in_run project-lifecycle && [ -z "${E2E_ADMIN_PASSWORD:-}" ]; then
      echo "Note: E2E_ADMIN_PASSWORD is not set, so the admin-only test (project-lifecycle) will skip."
    fi
  fi
  mkdir -p "$E2E_TOUR_DIR"
fi

# ---- Build the Playwright command ------------------------------------------------------

args=(playwright test)
for name in ${SELECTED[@]+"${SELECTED[@]}"}; do args+=("e2e/$name.spec.js"); done
# frontend/playwright.config.js records a video of every test only when this is 1.
if [ "$VIDEO" -eq 1 ]; then export E2E_VIDEO=1; else unset E2E_VIDEO; fi
if [ "$LIST" -eq 1 ]; then
  args+=(--list --reporter=list)
elif [ "$UI" -eq 1 ]; then
  args+=(--ui)
  if [ "$SHOW" -eq 1 ]; then
    export E2E_SLOWMO="${E2E_SLOWMO:-500}"
    args+=(--timeout=600000)   # the slowed-down steps would otherwise run past the 2-minute limit
  fi
else
  if [ "$REPORT" -eq 1 ] || [ "$VIDEO" -eq 1 ]; then
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
args+=(${PASS[@]+"${PASS[@]}"})   # after --: handed to Playwright unchanged

if [ "$LIST" -eq 0 ]; then
  echo
  echo "Target : $TARGET"
  echo "Files  : $( [ "${#SELECTED[@]}" -gt 0 ] && echo "${SELECTED[*]}" || echo "all ${#ALL[@]}" )"
  echo "Users  : manager $E2E_MANAGER_USERNAME, employee $E2E_EMPLOYEE_USERNAME (${E2E_EMPLOYEE_NAME:-name read at sign-in}), Zeus manager ${E2E_ZEUS_MANAGER_USERNAME:-(none)}"
  if [ "$UI" -eq 1 ]; then
    mode="Playwright's UI mode (a window: pick a test, press its play button, then replay any step)"
  elif [ "$SHOW" -eq 1 ]; then
    mode="a visible browser, $E2E_SLOWMO ms between steps"
  else
    mode="headless (add --show to watch, or --video to record)"
  fi
  [ "$VIDEO" -eq 1 ] && mode="$mode; every test recorded as a video"
  [ "$UI" -eq 1 ] && [ "$SHOW" -eq 1 ] && mode="$mode, $E2E_SLOWMO ms between steps"
  echo "Mode   : $mode"
  [ "${#PASS[@]}" -gt 0 ] && echo "Extra  : ${PASS[*]} (handed to Playwright)"
  if [ "$AWS" -eq 0 ] && [ "${#SELECTED[@]}" -eq 0 ]; then
    echo "Note   : this includes the files that write data (pull, requests, timelog, project-lifecycle): they add rows to the local database."
  fi
  if [ "$AWS" -eq 1 ] && [ "$UI" -eq 1 ]; then
    echo
    echo "WARNING: UI mode lets you run any file it lists. On the live site only the read-only files are"
    echo "         safe: $READ_ONLY."
    if [ "$WRITES" -eq 0 ]; then
      echo "         The files that write skip themselves there (you did not add --allow-writes)."
    fi
  fi
  echo
fi

# The loud warning before anything writes to the live site, then 5 seconds to change your mind.
if [ "$LIST" -eq 0 ] && [ "$AWS" -eq 1 ] && [ "$WRITES" -eq 1 ]; then
  err "!!! ============================================================================== !!!"
  err "!!! WARNING: this run ADDS DATA TO THE LIVE SITE, $AWS_SITE"
  for name in ${WRITERS[@]+"${WRITERS[@]}"}; do
    err "!!!   $name.spec.js $(why_not_aws "$name")"
  done
  [ "${#WRITERS[@]}" -eq 0 ] && err "!!!   (UI mode: whichever of pull, requests, timelog, project-lifecycle you run)"
  err "!!! Every run adds rows that stay for good (nothing is ever deleted): audit rows and bell"
  err "!!! notifications that Maria and every admin will see, and records in the live demo data."
  err "!!! Starting in 5 seconds. Press Ctrl+C now to stop."
  err "!!! ============================================================================== !!!"
  sleep 5
  export E2E_ALLOW_WRITES=1
fi

# ---- Run -------------------------------------------------------------------------------

cd "$FRONTEND" || exit 1
if [ "$UI" -eq 1 ]; then
  echo "Opening Playwright's UI mode. Close its window (or press Ctrl+C here) when you are done."
  npx "${args[@]}"
  exit $?
fi

LOG="$(mktemp -t e2e-XXXXXX.log)"
STARTED="$(mktemp -t e2e-started-XXXXXX)"   # its age marks the run's start (the log changes until the end)
trap 'rm -f "$STARTED"' EXIT
[ -t 1 ] && export FORCE_COLOR=1   # keep Playwright's colours even though the output goes through tee
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

# With --video: copy every video out of test-results (emptied at the start of each run) into a
# folder of its own, named after its test, so the next run keeps them.
if [ "$VIDEO" -eq 1 ]; then
  echo
  # Only this run's videos (newer than the start marker), and not attachments/, which holds the
  # report's copies of the people/ videos (each would be listed twice).
  videos="$(find "$FRONTEND/test-results" -name '*.webm' -newer "$STARTED" -not -path '*/attachments/*' 2>/dev/null | sort)"
  if [ -n "$videos" ]; then
    VIDEO_DIR="${E2E_VIDEO_DIR:-$HOME/e2e-videos}/$(TZ=America/New_York date +%Y-%m-%d_%H%M%S)$( [ "$AWS" -eq 1 ] && echo _aws || echo _local)"
    mkdir -p "$VIDEO_DIR"
    n=0
    while IFS= read -r video; do
      n=$((n + 1))
      # Named after the test's folder (e.g. history-an-employee-sees-My-history-...-chromium); a test
      # that signs in several people (requests, timelog) has one video per person, numbered.
      test_folder="$(basename "$(dirname "$video")")"
      [ "$test_folder" = people ] && test_folder="$(basename "$(dirname "$(dirname "$video")")")-person"
      cp "$video" "$VIDEO_DIR/${test_folder}-$n.webm"
    done <<< "$videos"
    echo "VIDEOS: $n recorded (one per test, one per person where a test signs in several), in $VIDEO_DIR:"
    for video in "$VIDEO_DIR"/*.webm; do echo "  $video"; done
    echo "Open one in any web browser or video player. The HTML report below plays each next to its steps."
  else
    echo "VIDEOS: none were recorded (did any test run?)."
  fi
fi

# The HTML report (--report, --video). It is a small web server that runs until Ctrl+C, so it is
# opened only for a person at a desktop; a script, or a shell with no screen, gets the command instead.
if [ "$REPORT" -eq 1 ] || [ "$VIDEO" -eq 1 ]; then
  echo
  if [ -t 0 ] && [ -t 1 ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    echo "Opening Playwright's report (http://localhost:9323). Press Ctrl+C here when you are done."
    npx playwright show-report
  else
    echo "Playwright's report is ready. To open it (from a terminal on the VDI's desktop):"
    echo "  cd $FRONTEND && npx playwright show-report"
  fi
fi

exit "$status"
