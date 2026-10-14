"""Requests: managers and employees ask, the people above them approve or reject.

Kinds: NEW_PROJECT and ARCHIVE_PROJECT (managers), TASK_LIMIT and OVERTIME
(employees), OTHER (both). Approving applies the change through the existing
services; a decision notifies the asker.
"""

import pytest

import factories as f
from domain.errors import Conflict, Forbidden, NotFound, ValidationError
from services import projects, requests, users


@pytest.fixture
def org(conn):
    admin = f.admin(conn)
    bob, _ = f.person(conn, admin, role="MANAGER", first_name="Bob")
    carol, _ = f.person(conn, admin, role="MANAGER", first_name="Carol")
    alice, _ = f.person(conn, admin, manager=bob, first_name="Alice")
    apollo = f.project(conn, admin, bob, name="Apollo")
    return {"admin": admin, "bob": bob, "carol": carol, "alice": alice, "apollo": apollo}


def file(conn, who, **extra):
    data = {"kind": "NEW_PROJECT", "name": "Hermes", "justification": "Customers asked for it",
            "proposed_start": "2026-11-01", "proposed_end": "2027-02-28"}
    data.update(extra)
    return requests.create_request(conn, who, data)


# A valid body for each kind, apart from ARCHIVE_PROJECT's project_id.
SAMPLE = {"NEW_PROJECT": {"name": "Hermes"}, "ARCHIVE_PROJECT": {}, "TASK_LIMIT": {"task_limit": 4},
          "OVERTIME": {}, "OTHER": {"name": "A second monitor"}}
SENDS = {"bob": {"NEW_PROJECT", "ARCHIVE_PROJECT", "OTHER"}, "alice": {"TASK_LIMIT", "OVERTIME", "OTHER"},
         "admin": set()}


def ask(conn, who, kind, **fields):
    """Send one request of `kind`, with a note, as `who`."""
    return requests.create_request(conn, who, {"kind": kind, "justification": "Launch week", **SAMPLE[kind], **fields})


@pytest.mark.parametrize("who", sorted(SENDS))
@pytest.mark.parametrize("kind", sorted(SAMPLE))
def test_each_role_sends_only_its_kinds(conn, org, who, kind):
    extra = {"project_id": org["apollo"]["project_id"]} if kind == "ARCHIVE_PROJECT" else {}
    if kind in SENDS[who]:
        row = ask(conn, org[who], kind, **extra)
        assert (row["status"], row["kind"], row["requested_by"]) == ("PENDING", kind, org[who].user_id)
    else:
        with pytest.raises(Forbidden):
            ask(conn, org[who], kind, **extra)


def test_archive_request_only_for_a_live_project_you_manage(conn, org):
    with pytest.raises(NotFound):
        ask(conn, org["carol"], "ARCHIVE_PROJECT", project_id=org["apollo"]["project_id"])
    row = ask(conn, org["bob"], "ARCHIVE_PROJECT", project_id=org["apollo"]["project_id"])
    assert (row["name"], row["project_id"]) == ("Archive Apollo", org["apollo"]["project_id"])
    projects.archive_project(conn, org["admin"], org["apollo"]["project_id"])
    with pytest.raises(Conflict):
        ask(conn, org["bob"], "ARCHIVE_PROJECT", project_id=org["apollo"]["project_id"])


@pytest.mark.parametrize("limit", [2, 11])
def test_task_limit_request_must_raise_the_limit(conn, org, limit):
    with pytest.raises(ValidationError) as refused:
        ask(conn, org["alice"], "TASK_LIMIT", task_limit=limit)
    assert refused.value.field == "task_limit"


def test_task_limit_request_names_the_new_limit(conn, org):
    row = ask(conn, org["alice"], "TASK_LIMIT", task_limit=4)
    assert (row["name"], row["task_limit"]) == ("Raise my task limit to 4", 4)


def test_overtime_request_only_while_overtime_is_off(conn, org):
    assert ask(conn, org["alice"], "OVERTIME")["name"] == "Allow overtime"
    users.set_capacity(conn, org["bob"], org["alice"].user_id, {"overtime_allowed": True})
    with pytest.raises(Conflict):
        ask(conn, org["alice"], "OVERTIME")


@pytest.mark.parametrize("kind", sorted(SAMPLE))
def test_every_request_needs_a_note(conn, org, kind):
    who = org["bob"] if kind in SENDS["bob"] else org["alice"]
    extra = {"project_id": org["apollo"]["project_id"]} if kind == "ARCHIVE_PROJECT" else {}
    with pytest.raises(ValidationError) as refused:
        ask(conn, who, kind, justification=None, **extra)
    assert refused.value.field == "justification"


def test_a_field_from_another_kind_is_refused(conn, org):
    with pytest.raises(ValidationError) as refused:
        ask(conn, org["alice"], "OVERTIME", task_limit=4)
    assert refused.value.field == "task_limit"


def test_unknown_kind_is_refused(conn, org):
    with pytest.raises(ValidationError):
        requests.create_request(conn, org["alice"], {"kind": "RAISE", "justification": "Please"})


def test_manager_files_a_request(conn, org):
    row = file(conn, org["bob"])
    assert (row["status"], row["requested_by"]) == ("PENDING", org["bob"].user_id)


def test_managers_see_their_own_requests_and_admins_see_all(conn, org):
    file(conn, org["bob"])
    file(conn, org["carol"], name="Iris")
    assert [r["name"] for r in requests.list_requests(conn, org["bob"], {}, 1, 50)["items"]] == ["Hermes"]
    assert requests.list_requests(conn, org["admin"], {}, 1, 50)["total"] == 2


def test_approval_creates_the_project_managed_by_the_requester(conn, org):
    req = file(conn, org["bob"])
    result = requests.approve_request(conn, org["admin"], req["request_id"], {"budget_cents": 2_000_000})
    project = result["project"]
    assert (project["name"], project["manager_id"], project["budget_cents"]) == ("Hermes", org["bob"].user_id, 2_000_000)
    assert result["request"]["created_project_id"] == project["project_id"]
    audited = conn.execute("SELECT entity_type FROM audit_log WHERE action IN ('APPROVE', 'CREATE')"
                           " AND entity_type IN ('projects', 'project_requests') ORDER BY audit_id DESC LIMIT 2").fetchall()
    assert {a["entity_type"] for a in audited} == {"projects", "project_requests"}


def test_approval_needs_dates(conn, org):
    req = file(conn, org["bob"], proposed_start=None, proposed_end=None)
    with pytest.raises(ValidationError) as no_start:
        requests.approve_request(conn, org["admin"], req["request_id"], {})
    with pytest.raises(ValidationError) as no_end:
        requests.approve_request(conn, org["admin"], req["request_id"], {"start_date": "2026-11-01"})
    assert (no_start.value.field, no_end.value.field) == ("start_date", "predicted_end_date")


def test_proposed_end_cannot_precede_the_start(conn, org):
    with pytest.raises(ValidationError) as refused:
        file(conn, org["bob"], proposed_start="2026-11-01", proposed_end="2026-10-01")
    assert refused.value.field == "proposed_end"


def test_rejection_records_the_note(conn, org):
    req = file(conn, org["bob"])
    row = requests.reject_request(conn, org["admin"], req["request_id"], {"decision_note": "Not this quarter"})
    assert (row["status"], row["decision_note"]) == ("REJECTED", "Not this quarter")


def test_a_request_is_decided_once(conn, org):
    req = file(conn, org["bob"])
    requests.reject_request(conn, org["admin"], req["request_id"], {})
    with pytest.raises(Conflict):
        requests.approve_request(conn, org["admin"], req["request_id"], {})


def test_managers_cannot_decide_their_own_requests(conn, org):
    req = file(conn, org["bob"])
    with pytest.raises(NotFound):
        requests.approve_request(conn, org["bob"], req["request_id"], {})


def test_employees_never_decide(conn, org):
    req = ask(conn, org["alice"], "OTHER", name="A desk")
    with pytest.raises(Forbidden):
        requests.reject_request(conn, org["alice"], req["request_id"], {})


def test_another_managers_request_is_not_found(conn, org):
    req = file(conn, org["bob"])
    with pytest.raises(NotFound):
        requests.get_request(conn, org["carol"], req["request_id"])


# --- who sees what: Mine and To decide ------------------------------------------

def names(conn, who, **filters):
    return [r["name"] for r in requests.list_requests(conn, who, filters, 1, 50)["items"]]


def test_employee_sees_only_their_own_requests(conn, org):
    ask(conn, org["alice"], "OVERTIME")
    dave, _ = f.person(conn, org["admin"], manager=org["bob"], first_name="Dave")
    ask(conn, dave, "OTHER", name="A desk")
    file(conn, org["bob"])
    assert names(conn, org["alice"]) == ["Allow overtime"]


def test_line_manager_sees_their_reports_requests_in_to_decide(conn, org):
    ask(conn, org["alice"], "OVERTIME")
    file(conn, org["bob"])
    assert names(conn, org["bob"], scope="TO_DECIDE") == ["Allow overtime"]
    assert names(conn, org["bob"], scope="MINE") == ["Hermes"]
    assert names(conn, org["bob"]) == ["Hermes", "Allow overtime"]
    assert names(conn, org["carol"], scope="TO_DECIDE") == []


def test_admin_to_decide_has_every_request(conn, org):
    ask(conn, org["alice"], "OVERTIME")
    file(conn, org["bob"])
    assert names(conn, org["admin"], scope="TO_DECIDE") == ["Hermes", "Allow overtime"]
    assert names(conn, org["admin"], scope="MINE") == []


def test_kind_filter(conn, org):
    ask(conn, org["alice"], "OVERTIME")
    ask(conn, org["alice"], "OTHER", name="A desk")
    assert names(conn, org["alice"], kind="OTHER") == ["A desk"]


def test_each_listed_request_names_its_asker(conn, org):
    ask(conn, org["alice"], "OVERTIME")
    [item] = requests.list_requests(conn, org["bob"], {"scope": "TO_DECIDE"}, 1, 50)["items"]
    assert item["requester_name"] == "Alice Tester"


def test_another_managers_report_request_is_not_found(conn, org):
    req = ask(conn, org["alice"], "OVERTIME")
    assert requests.get_request(conn, org["bob"], req["request_id"])["name"] == "Allow overtime"
    with pytest.raises(NotFound):
        requests.get_request(conn, org["carol"], req["request_id"])


# --- deciding: the change is applied, the asker is told -------------------------

def setting(conn, who, column):
    return conn.execute("SELECT task_limit, overtime_allowed FROM users WHERE user_id = %s",
                        (who.user_id,)).fetchone()[column]


def test_approving_an_archive_request_archives_the_project_and_its_work(conn, org):
    work = f.task(conn, org["bob"], f.deliverable(conn, org["bob"], org["apollo"]))
    req = ask(conn, org["bob"], "ARCHIVE_PROJECT", project_id=org["apollo"]["project_id"])
    result = requests.approve_request(conn, org["admin"], req["request_id"], {"decision_note": "Done"})
    assert (result["request"]["status"], result["project"]) == ("APPROVED", None)
    archived = conn.execute("SELECT is_archived FROM tasks WHERE task_id = %s", (work["task_id"],)).fetchone()
    assert archived["is_archived"]
    actions = {(a["action"], a["entity_type"]) for a in conn.execute("SELECT action, entity_type FROM audit_log")}
    assert {("APPROVE", "project_requests"), ("ARCHIVE", "projects")} <= actions


def test_approving_a_task_limit_request_sets_the_limit(conn, org):
    req = ask(conn, org["alice"], "TASK_LIMIT", task_limit=4)
    requests.approve_request(conn, org["bob"], req["request_id"], {})
    assert setting(conn, org["alice"], "task_limit") == 4


def test_approving_never_lowers_a_task_limit(conn, org):
    req = ask(conn, org["alice"], "TASK_LIMIT", task_limit=4)
    users.set_capacity(conn, org["bob"], org["alice"].user_id, {"task_limit": 6})
    with pytest.raises(Conflict):
        requests.approve_request(conn, org["bob"], req["request_id"], {})
    assert setting(conn, org["alice"], "task_limit") == 6


def test_approving_overtime_turns_it_on(conn, org):
    req = ask(conn, org["alice"], "OVERTIME")
    requests.approve_request(conn, org["admin"], req["request_id"], {})
    assert setting(conn, org["alice"], "overtime_allowed") is True


def counts(conn):
    return conn.execute("SELECT (SELECT count(*) FROM users) AS u, (SELECT count(*) FROM projects) AS p").fetchone()


def test_approving_free_text_changes_only_the_request(conn, org):
    req = ask(conn, org["alice"], "OTHER", name="A desk")
    before = (counts(conn), setting(conn, org["alice"], "task_limit"))
    row = requests.approve_request(conn, org["bob"], req["request_id"], {"decision_note": "Ordered"})["request"]
    assert (row["status"], row["decision_note"]) == ("APPROVED", "Ordered")
    assert (counts(conn), setting(conn, org["alice"], "task_limit")) == before


def test_approving_a_non_project_request_takes_only_a_note(conn, org):
    req = ask(conn, org["alice"], "OVERTIME")
    with pytest.raises(ValidationError) as refused:
        requests.approve_request(conn, org["bob"], req["request_id"], {"budget_cents": 100})
    assert refused.value.field == "budget_cents"


def test_rejecting_changes_nothing_but_the_request(conn, org):
    req = ask(conn, org["alice"], "TASK_LIMIT", task_limit=4)
    row = requests.reject_request(conn, org["bob"], req["request_id"], {"decision_note": "Not now"})
    assert (row["status"], setting(conn, org["alice"], "task_limit")) == ("REJECTED", 2)


def test_another_manager_cannot_decide_my_report_request(conn, org):
    req = ask(conn, org["alice"], "OVERTIME")
    with pytest.raises(NotFound):
        requests.approve_request(conn, org["carol"], req["request_id"], {})


def test_manager_cannot_decide_a_managers_request(conn, org):
    req = ask(conn, org["carol"], "OTHER", name="A bigger room")
    with pytest.raises(NotFound):
        requests.approve_request(conn, org["bob"], req["request_id"], {})


def test_decision_notifies_the_asker(conn, org):
    req = ask(conn, org["alice"], "OVERTIME")
    requests.approve_request(conn, org["bob"], req["request_id"], {})
    told = conn.execute("SELECT n.recipient_user_id, a.summary FROM notifications n JOIN audit_log a USING (audit_id)"
                        " WHERE a.action = 'APPROVE' AND a.entity_type = 'project_requests'").fetchall()
    recipients = {t["recipient_user_id"] for t in told}
    assert org["alice"].user_id in recipients and org["bob"].user_id not in recipients
    assert told[0]["summary"] == "Bob Tester approved Alice Tester's request: Allow overtime"


def test_archive_approval_is_409_if_already_archived_and_leaves_the_request_pending(conn, org):
    req = ask(conn, org["bob"], "ARCHIVE_PROJECT", project_id=org["apollo"]["project_id"])
    projects.archive_project(conn, org["admin"], org["apollo"]["project_id"])
    with pytest.raises(Conflict):
        requests.approve_request(conn, org["admin"], req["request_id"], {})
    assert requests.get_request(conn, org["admin"], req["request_id"])["status"] == "PENDING"
