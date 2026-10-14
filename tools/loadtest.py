"""Load-test a running tracker API: concurrent users hitting the dashboard's endpoints.

Python standard library only, like demo.py, so it runs anywhere demo.py runs:
locally through the proxy, or against the deployed CloudFront URL.

    python3 tools/loadtest.py                      # 10 users for 20 s, then a login burst
    python3 tools/loadtest.py --users 25 --seconds 60

Environment: TRACKER_API and TRACKER_ADMIN_PASSWORD, as for demo.py. Run
`demo.py seed` first so the endpoints have data to compute over.

Each simulated user loops over the reads a manager's dashboard makes. Logins are
measured separately because password hashing (PBKDF2, 600k rounds) is the
deliberately slow, CPU-bound request. Exit code 1 if any request failed.
"""

import argparse
import os
import statistics
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

import demo

READS = ["/dashboard/projects", "/dashboard/at-risk", "/dashboard/allocation", "/notifications/unread-count",
         "/projects/{pid}/budget", "/projects/{pid}/milestones"]


def timed(api: demo.Api, method: str, path: str, body: dict | None = None) -> tuple[int, float]:
    start = time.perf_counter()
    try:
        status, _ = api.call(method, path, body)
    except OSError:  # connection refused, reset or timed out
        status = 0
    return status, (time.perf_counter() - start) * 1000


def reader(api: demo.Api, paths: list[str], deadline: float) -> list[tuple[str, int, float]]:
    results, i = [], 0
    while time.monotonic() < deadline:
        path = paths[i % len(paths)]
        results.append((path, *timed(api, "GET", path)))
        i += 1
    return results


def report(title: str, results: list[tuple[str, int, float]], seconds: float) -> int:
    """Print a table per endpoint; return the number of failed requests."""
    by_path = defaultdict(list)
    for path, status, ms in results:
        by_path[path].append((status, ms))
    print(f"\n{title}: {len(results)} requests in {seconds:.1f} s = {len(results) / seconds:.1f} req/s")
    print(f"  {'endpoint':36} {'count':>6} {'errors':>6} {'p50 ms':>8} {'p95 ms':>8} {'max ms':>8}")
    failed = 0
    for path, rows in sorted(by_path.items()):
        times = sorted(ms for _, ms in rows)
        errors = sum(1 for status, _ in rows if not 200 <= status < 300)
        failed += errors
        p95 = times[min(len(times) - 1, int(len(times) * 0.95))]
        print(f"  {path:36} {len(rows):6} {errors:6} {statistics.median(times):8.0f} {p95:8.0f} {times[-1]:8.0f}")
    if failed:
        statuses = Counter(status for _, status, _ in results if not 200 <= status < 300)
        print("  failures by status (0 = no response):",
              ", ".join(f"{status}: {n}" for status, n in sorted(statuses.items())))
    return failed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--users", type=int, default=10, help="concurrent simulated users (default 10)")
    parser.add_argument("--seconds", type=float, default=20, help="how long the read phase runs (default 20)")
    parser.add_argument("--logins", type=int, default=20, help="logins in the login burst (default 20)")
    args = parser.parse_args()

    password = os.getenv("TRACKER_ADMIN_PASSWORD")
    if not password:
        sys.exit("Set TRACKER_ADMIN_PASSWORD to the admin's current password.")
    admin = demo.admin_session()
    projects = admin.ok("GET", "/projects")["items"]
    if not projects:
        sys.exit("No projects to read: run `python3 tools/demo.py seed` first.")
    paths = [p.format(pid=projects[0]["projectId"]) for p in READS]
    print(f"Target {demo.API}: {args.users} users for {args.seconds:.0f} s, then {args.logins} logins")

    start = time.monotonic()
    with ThreadPoolExecutor(args.users) as pool:
        # Stagger each user's starting endpoint so they don't all hit the same one at once.
        futures = [pool.submit(reader, admin, paths[i % len(paths):] + paths[:i % len(paths)],
                               start + args.seconds) for i in range(args.users)]
        reads = [row for f in futures for row in f.result()]
    failed = report("Reads", reads, time.monotonic() - start)

    start = time.monotonic()
    body = {"username": "AD000001", "password": password}
    with ThreadPoolExecutor(min(args.users, args.logins)) as pool:
        logins = list(pool.map(lambda _: ("/auth/login", *timed(demo.Api(), "POST", "/auth/login", body)),
                               range(args.logins)))
    failed += report("Logins", logins, time.monotonic() - start)

    print(f"\n{'FAILED' if failed else 'OK'}: {failed} failed requests")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
