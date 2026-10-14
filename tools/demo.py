"""Seed demo data and replay the business rules against a running tracker API.

Talks to the API over HTTP only (Python standard library, no dependencies), so
the same commands work locally (through the proxy) and against the deployed
CloudFront URL, where Aurora isn't reachable any other way.

    python3 tools/demo.py seed   # create users, projects, bookings, deliverables, tasks, time
    python3 tools/demo.py demo   # walk the seven questions, then try to break every rule

Environment:
    TRACKER_API             default http://localhost:3001/api/tracker
    TRACKER_ADMIN_PASSWORD  the admin's current password (AD000001)
    TRACKER_NEW_ADMIN_PASSWORD  only on the very first run, while the admin still
                            has the generated password that must be changed
Every seeded person's password is set to DEMO_PASSWORD below.
"""

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

API = os.getenv("TRACKER_API", "http://localhost:3001/api/tracker").rstrip("/")
DEMO_PASSWORD = "Demo-pass-2026"
TODAY = dt.datetime.now(ZoneInfo("America/New_York")).date()
MONDAY = TODAY - dt.timedelta(days=TODAY.weekday())
LAST_MONDAY = MONDAY - dt.timedelta(days=7)

PEOPLE = [  # first, last, email, role, line manager (by email), salary dollars, capacity, overtime allowed
    ("Maria", "Lopez", "maria.lopez@acme.test", "MANAGER", None, 130_000, 40, False),
    ("Sam", "Patel", "sam.patel@acme.test", "MANAGER", None, 125_000, 40, False),
    ("Ana", "Ruiz", "ana.ruiz@acme.test", "EMPLOYEE", "maria.lopez@acme.test", 95_000, 40, False),
    ("Ben", "Okafor", "ben.okafor@acme.test", "EMPLOYEE", "maria.lopez@acme.test", 80_000, 40, False),
    ("Chloe", "Kim", "chloe.kim@acme.test", "EMPLOYEE", "sam.patel@acme.test", 120_000, 40, True),
    ("Dev", "Shah", "dev.shah@acme.test", "EMPLOYEE", "sam.patel@acme.test", 70_000, 20, False),
]


def day(offset: int) -> str:
    return (TODAY + dt.timedelta(days=offset)).isoformat()


class Api:
    """A signed-in session."""

    def __init__(self, token: str | None = None, label: str = "anonymous"):
        self.token, self.label = token, label

    def call(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict | None]:
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(API + path, data=data, method=method,
                                     headers={"content-type": "application/json",
                                              **({"authorization": f"Bearer {self.token}"} if self.token else {})})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
                return resp.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as err:
            raw = err.read()
            try:
                return err.code, json.loads(raw)
            except json.JSONDecodeError:
                return err.code, {"error": raw.decode(errors="replace")[:200]}

    def ok(self, method: str, path: str, body: dict | None = None) -> dict:
        status, payload = self.call(method, path, body)
        if status not in (200, 201):
            sys.exit(f"FAILED {self.label}: {method} {path} -> {status} {payload}")
        return payload


def sign_in(username: str, password: str, new_password: str | None = None) -> Api:
    status, payload = Api().call("POST", "/auth/login", {"username": username, "password": password})
    if status != 200:
        sys.exit(f"Login failed for {username}: {status} {payload}")
    api = Api(payload["token"], username)
    if payload["user"]["mustChangePassword"]:
        if not new_password:
            sys.exit(f"{username} must change their password first: set TRACKER_NEW_ADMIN_PASSWORD.")
        api.ok("POST", "/auth/change-password", {"currentPassword": password, "newPassword": new_password})
    return api


def admin_session() -> Api:
    password = os.getenv("TRACKER_ADMIN_PASSWORD")
    if not password:
        sys.exit("Set TRACKER_ADMIN_PASSWORD to the admin's current password.")
    return sign_in("AD000001", password, os.getenv("TRACKER_NEW_ADMIN_PASSWORD"))


def find_user(admin: Api, email: str) -> dict | None:
    items = admin.ok("GET", f"/users?search={email}&includeArchived=true")["items"]
    return next((u for u in items if u["email"] == email), None)


def find_project(api: Api, name: str) -> dict | None:
    items = api.ok("GET", f"/projects?search={name}&includeArchived=true")["items"]
    return next((p for p in items if p["name"] == name), None)


def person_session(admin: Api, email: str) -> Api:
    user = find_user(admin, email)
    return sign_in(user["username"], DEMO_PASSWORD)


def step(text: str) -> None:
    print(f"  - {text}")


# --- seed -----------------------------------------------------------------------------------

def seed() -> None:
    admin = admin_session()
    if find_project(admin, "Apollo"):
        print("Already seeded (project Apollo exists). Run: python3 tools/demo.py demo")
        return
    print(f"Seeding {API} (today is {TODAY.isoformat()}, Eastern time)")
    users = {}
    for first, last, email, role, manager_email, salary, capacity, overtime in PEOPLE:
        existing = find_user(admin, email)
        if existing:
            users[email] = existing
            continue
        body = {"firstName": first, "lastName": last, "email": email, "role": role,
                "annualSalaryCents": salary * 100, "weeklyCapacityHours": capacity, "overtimeAllowed": overtime,
                "jobTitle": "Project Manager" if role == "MANAGER" else "Engineer"}
        if manager_email:
            body["managerId"] = users[manager_email]["userId"]
        created = admin.ok("POST", "/users", body)
        users[email] = created["user"]
        sign_in(created["user"]["username"], created["temporaryPassword"], DEMO_PASSWORD)
        step(f"{role.lower()} {first} {last}: username {created['user']['username']}")
    s = {email: person_session(admin, email) for email in users}
    uid = {email: u["userId"] for email, u in users.items()}
    maria, sam = s["maria.lopez@acme.test"], s["sam.patel@acme.test"]
    ana, ben, chloe = s["ana.ruiz@acme.test"], s["ben.okafor@acme.test"], s["chloe.kim@acme.test"]

    # Apollo: healthy-ish, with a dependency chain Design -> Build -> Launch.
    apollo = admin.ok("POST", "/projects", {"name": "Apollo", "description": "Customer portal rebuild",
                                            "managerId": uid["maria.lopez@acme.test"], "startDate": day(-35),
                                            "predictedEndDate": day(60), "budgetCents": 150_000_00, "status": "ACTIVE"})
    pa = apollo["projectId"]
    maria.ok("POST", f"/projects/{pa}/assignments", {"userId": uid["ana.ruiz@acme.test"], "hoursPerWeek": 30,
                                                     "startDate": day(-35), "endDate": day(60)})
    maria.ok("POST", f"/projects/{pa}/assignments", {"userId": uid["ben.okafor@acme.test"], "hoursPerWeek": 25,
                                                     "startDate": day(-35), "endDate": day(60)})
    design = maria.ok("POST", f"/projects/{pa}/milestones", {"name": "Design", "startDate": day(-35), "dueDate": day(-7)})
    build = maria.ok("POST", f"/projects/{pa}/milestones", {"name": "Build", "startDate": day(-10), "dueDate": day(30)})
    launch = maria.ok("POST", f"/projects/{pa}/milestones", {"name": "Launch", "startDate": day(25), "dueDate": day(60)})
    maria.ok("POST", f"/milestones/{build['milestoneId']}/dependencies", {"dependsOnMilestoneId": design["milestoneId"]})
    maria.ok("POST", f"/milestones/{launch['milestoneId']}/dependencies", {"dependsOnMilestoneId": build["milestoneId"]})
    wireframes = maria.ok("POST", f"/milestones/{design['milestoneId']}/tasks",
                          {"title": "Wireframes", "estimateMinutes": 16 * 60, "assigneeUserId": uid["ana.ruiz@acme.test"]})
    ana.ok("POST", f"/tasks/{wireframes['taskId']}/status", {"status": "DONE"})
    maria.ok("POST", f"/milestones/{design['milestoneId']}/sign-off")
    api_task = maria.ok("POST", f"/milestones/{build['milestoneId']}/tasks",
                        {"title": "Portal API", "estimateMinutes": 60 * 60, "assigneeUserId": uid["ana.ruiz@acme.test"]})
    ui_task = maria.ok("POST", f"/milestones/{build['milestoneId']}/tasks",
                       {"title": "Portal UI", "estimateMinutes": 40 * 60, "assigneeUserId": uid["ben.okafor@acme.test"]})
    maria.ok("POST", f"/milestones/{launch['milestoneId']}/tasks", {"title": "Go-live checklist", "estimateMinutes": 8 * 60})
    ana.ok("POST", f"/tasks/{api_task['taskId']}/status", {"status": "IN_PROGRESS"})
    step("Apollo: 3 deliverables (Design signed off -> Build -> Launch), 4 tasks")

    # Zeus: over-allocates Ben, overdue deliverable, budget burning fast.
    zeus = admin.ok("POST", "/projects", {"name": "Zeus", "description": "Data centre migration",
                                          "managerId": uid["sam.patel@acme.test"], "startDate": day(-60),
                                          "predictedEndDate": day(10), "budgetCents": 40_000_00, "status": "ACTIVE"})
    pz = zeus["projectId"]
    sam.ok("POST", f"/projects/{pz}/assignments", {"userId": uid["chloe.kim@acme.test"], "hoursPerWeek": 30,
                                                   "startDate": day(-60), "endDate": day(10)})
    sam.ok("POST", f"/projects/{pz}/assignments", {"userId": uid["ben.okafor@acme.test"], "hoursPerWeek": 20,
                                                   "startDate": day(-60), "endDate": day(10)})
    migration = sam.ok("POST", f"/projects/{pz}/milestones", {"name": "Migration", "startDate": day(-60), "dueDate": day(-3)})
    cutover = sam.ok("POST", f"/milestones/{migration['milestoneId']}/tasks",
                     {"title": "Cut over databases", "estimateMinutes": 80 * 60, "assigneeUserId": uid["chloe.kim@acme.test"]})
    step("Zeus: Ben booked 25 h (Apollo) + 20 h (Zeus) = 45 h/week; Migration overdue")

    # Time: last week, so the week is complete.
    for offset in range(5):
        when = (LAST_MONDAY + dt.timedelta(days=offset)).isoformat()
        e = ana.ok("POST", f"/tasks/{api_task['taskId']}/time-entries", {"workDate": when, "minutes": 6 * 60})
        maria.ok("POST", f"/time-entries/{e['entryId']}/approve")
        ben.ok("POST", f"/tasks/{ui_task['taskId']}/time-entries", {"workDate": when, "minutes": 8 * 60})
        c = chloe.ok("POST", f"/tasks/{cutover['taskId']}/time-entries", {"workDate": when, "minutes": 10 * 60})
        sam.ok("POST", f"/time-entries/{c['entryId']}/approve")
    step("last week: Ana 30 h (approved), Ben 40 h (pending: at capacity), Chloe 50 h (approved, overtime on)")

    # Intake and history.
    req = sam.ok("POST", "/project-requests", {"name": "Hermes", "justification": "Partners asked for an API",
                                               "proposedStart": day(14), "proposedEnd": day(120)})
    admin.ok("POST", f"/project-requests/{req['requestId']}/approve", {"budgetCents": 80_000_00})
    maria.ok("POST", "/project-requests", {"name": "Iris", "justification": "Internal analytics dashboard"})
    legacy = admin.ok("POST", "/projects", {"name": "Legacy CRM", "managerId": uid["maria.lopez@acme.test"],
                                            "startDate": day(-200), "predictedEndDate": day(-40), "status": "COMPLETE"})
    admin.ok("POST", f"/projects/{legacy['projectId']}/archive")
    step("Hermes approved from a request, Iris pending, Legacy CRM archived")
    print(f"\nDone. Every seeded person's password is {DEMO_PASSWORD}. Usernames: python3 tools/demo.py demo")


# --- demo ------------------------------------------------------------------------------------

def expect(label: str, status: int, payload, wanted: int) -> None:
    mark = "REFUSED as designed" if wanted >= 400 and status == wanted else ("OK" if status == wanted else "UNEXPECTED")
    message = (payload or {}).get("error", "") if isinstance(payload, dict) else ""
    print(f"  [{status}] {mark}: {label}" + (f"\n        \"{message}\"" if message else ""))


def demo() -> None:
    admin = admin_session()
    if not find_project(admin, "Apollo"):
        sys.exit("No demo data yet. Run: python3 tools/demo.py seed")
    people = {p[2]: find_user(admin, p[2]) for p in PEOPLE}
    print("Demo accounts (password " + DEMO_PASSWORD + "):")
    for email, user in people.items():
        print(f"  {user['username']}  {user['firstName'] + ' ' + user['lastName']:<14} {user['role']}")
    maria = person_session(admin, "maria.lopez@acme.test")
    ana = person_session(admin, "ana.ruiz@acme.test")
    ben = person_session(admin, "ben.okafor@acme.test")
    apollo, zeus = find_project(admin, "Apollo"), find_project(admin, "Zeus")

    print("\nThe seven questions")
    cards = admin.ok("GET", "/dashboard/projects")["items"]
    print("  1, 2 and 7. The dashboard, one card per live project (at risk first):")
    for c in cards:
        flag = "AT RISK" if c["atRisk"] else "on track"
        print(f"       {c['name']:<7} {c['status']:<9} {c['progressPercent']:>3}% done  {flag:<8}"
              f"  spent ${c['consumedCents'] / 100:,.0f} of ${c['budgetCents'] / 100:,.0f}"
              f" (planned ${c['plannedCents'] / 100:,.0f}, pending ${c['pendingCents'] / 100:,.0f})")
        for r in c["riskReasons"]:
            print(f"               - {r['message']}")
    grid = admin.ok("GET", f"/dashboard/allocation?weekFrom={LAST_MONDAY.isoformat()}&weeks=2")
    print(f"  3 and 5. Allocation, week of {grid['weeks'][0]}, worst first (booked h / capacity, where from):")
    for person in grid["items"]:
        w = person["weeks"][0]
        flags = (f" OVER BY {w['overByHours']} h" if w["overAllocated"] else "") + (" OVERTIME" if w["overtime"] else "")
        share = ", ".join(f"{s['name']} {s['hours']} h" for s in w["projects"]) or "unbooked"
        print(f"       {person['name']:<12} {w['bookedHours']:>2}/{person['capacityHours']} h ({share}),"
              f" logged {w['loggedHours']:g} h{flags}")
    over = admin.ok("GET", f"/dashboard/allocation?weekFrom={LAST_MONDAY.isoformat()}&weeks=2&overOnly=true")
    print(f"       Only over-allocated: {', '.join(p['name'] for p in over['items']) or 'no one'}")
    print("  4. Deliverables of Apollo:")
    for m in maria.ok("GET", f"/projects/{apollo['projectId']}/milestones")["items"]:
        print(f"       {m['name']:<8} {m['status']:<12} {m['progressPercent']:>3}%  due {m['dueDate']}")
    graph = maria.ok("GET", f"/projects/{apollo['projectId']}/dependency-graph")
    names = {n["milestoneId"]: n["name"] for n in graph["nodes"]}
    print("  6. Dependency chain: " + ", ".join(f"{names[e['from']]} needs {names[e['to']]}" for e in graph["edges"]))

    print("\nTrying to break the rules")
    tasks = ben.ok("GET", "/me/tasks")["items"]
    ui_task = next(t for t in tasks if t["title"] == "Portal UI")
    saturday = (LAST_MONDAY + dt.timedelta(days=5)).isoformat()
    expect("Ben logs 2 more hours last week: he is at 40 h with overtime off",
           *ben.call("POST", f"/tasks/{ui_task['taskId']}/time-entries", {"workDate": saturday, "minutes": 120}), 409)
    expect("Ben logs time tomorrow", *ben.call("POST", f"/tasks/{ui_task['taskId']}/time-entries",
                                                 {"workDate": day(1), "minutes": 60}), 400)
    status, mine = maria.call("GET", f"/projects/{zeus['projectId']}")
    expect("Maria opens Zeus, which Sam manages", status, mine, 404)
    expect("...and a project id that doesn't exist (same answer, so ids can't be probed)",
           *maria.call("GET", "/projects/999999"), 404)
    expect("Ana (employee) creates a project", *ana.call("POST", "/projects", {"name": "Mine"}), 403)
    expect("Ana approves time", *ana.call("POST", "/time-entries/1/approve"), 403)
    ms = {m["name"]: m for m in maria.ok("GET", f"/projects/{apollo['projectId']}/milestones")["items"]}
    expect("Maria makes Design depend on Launch (Launch already needs Build, which needs Design)",
           *maria.call("POST", f"/milestones/{ms['Design']['milestoneId']}/dependencies",
                       {"dependsOnMilestoneId": ms["Launch"]["milestoneId"]}), 409)
    expect("Maria signs off Build while its tasks are open",
           *maria.call("POST", f"/milestones/{ms['Build']['milestoneId']}/sign-off"), 409)
    expect("Anyone deletes a project (there is no DELETE)", *admin.call("DELETE", f"/projects/{apollo['projectId']}"), 405)
    expect("A request with no token", *Api().call("GET", "/projects"), 401)
    print("\nThe invariant")
    result = admin.ok("GET", "/admin/integrity-check")
    print(f"  {result['checks']} integrity checks, {len(result['violations'])} violations")


if __name__ == "__main__":
    commands = {"seed": seed, "demo": demo}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        sys.exit(__doc__)
    commands[sys.argv[1]]()
