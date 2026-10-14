"""Project requests: a manager asks, an admin approves (creating the project) or rejects."""

import pytest

import factories as f
from domain.errors import Conflict, Forbidden, NotFound, ValidationError
from services import requests


@pytest.fixture
def org(conn):
    admin = f.admin(conn)
    bob, _ = f.person(conn, admin, role="MANAGER", first_name="Bob")
    carol, _ = f.person(conn, admin, role="MANAGER", first_name="Carol")
    alice, _ = f.person(conn, admin, manager=bob, first_name="Alice")
    return {"admin": admin, "bob": bob, "carol": carol, "alice": alice}


def file(conn, who, **extra):
    data = {"name": "Hermes", "justification": "Customers asked for it",
            "proposed_start": "2026-11-01", "proposed_end": "2027-02-28"}
    data.update(extra)
    return requests.create_request(conn, who, data)


def test_manager_files_a_request(conn, org):
    row = file(conn, org["bob"])
    assert (row["status"], row["requested_by"]) == ("PENDING", org["bob"].user_id)


@pytest.mark.parametrize("who", ["alice", "admin"])
def test_only_managers_file_requests(conn, org, who):
    with pytest.raises(Forbidden):
        file(conn, org[who])


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
    with pytest.raises(ValidationError):
        requests.approve_request(conn, org["admin"], req["request_id"], {})


def test_rejection_records_the_note(conn, org):
    req = file(conn, org["bob"])
    row = requests.reject_request(conn, org["admin"], req["request_id"], {"decision_note": "Not this quarter"})
    assert (row["status"], row["decision_note"]) == ("REJECTED", "Not this quarter")


def test_a_request_is_decided_once(conn, org):
    req = file(conn, org["bob"])
    requests.reject_request(conn, org["admin"], req["request_id"], {})
    with pytest.raises(Conflict):
        requests.approve_request(conn, org["admin"], req["request_id"], {})


def test_managers_cannot_decide_requests(conn, org):
    req = file(conn, org["bob"])
    with pytest.raises(Forbidden):
        requests.approve_request(conn, org["bob"], req["request_id"], {})


def test_another_managers_request_is_not_found(conn, org):
    req = file(conn, org["bob"])
    with pytest.raises(NotFound):
        requests.get_request(conn, org["carol"], req["request_id"])
