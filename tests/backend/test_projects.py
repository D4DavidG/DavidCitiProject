"""Projects and bookings ("Resources"): who may create, see, edit and archive them."""

import pytest

import factories as f
from domain.errors import Conflict, Forbidden, NotFound, ValidationError
from services import assignments, projects


@pytest.fixture
def org(conn):
    admin = f.admin(conn)
    bob, _ = f.person(conn, admin, role="MANAGER", first_name="Bob")
    carol, _ = f.person(conn, admin, role="MANAGER", first_name="Carol")
    alice, _ = f.person(conn, admin, manager=bob, first_name="Alice")
    eve, _ = f.person(conn, admin, manager=bob, first_name="Eve")
    apollo = f.project(conn, admin, bob, name="Apollo")
    zeus = f.project(conn, admin, carol, name="Zeus")
    f.booking(conn, admin, apollo, alice)
    return {"admin": admin, "bob": bob, "carol": carol, "alice": alice, "eve": eve,
            "apollo": apollo, "zeus": zeus}


# --- create ----------------------------------------------------------------------

def test_admin_creates_a_project_with_a_manager(conn, org):
    row = projects.create_project(conn, org["admin"], {
        "name": "Hermes", "manager_id": org["bob"].user_id, "start_date": "2026-11-01",
        "predicted_end_date": "2027-01-31", "budget_cents": 1_000_000})
    assert (row["name"], row["status"], row["budget_cents"]) == ("Hermes", "PLANNING", 1_000_000)


def test_only_admins_create_projects(conn, org):
    with pytest.raises(Forbidden):
        f.project(conn, org["bob"], org["bob"])


def test_project_manager_must_have_the_manager_role(conn, org):
    with pytest.raises(ValidationError) as caught:
        f.project(conn, org["admin"], org["alice"])
    assert caught.value.field == "manager_id"


def test_budget_must_be_integer_cents(conn, org):
    with pytest.raises(ValidationError) as caught:
        f.project(conn, org["admin"], org["bob"], budget_cents=1000.5)
    assert caught.value.field == "budget_cents"


def test_end_before_start_is_refused(conn, org):
    with pytest.raises(ValidationError):
        f.project(conn, org["admin"], org["bob"], start_date="2026-12-01", predicted_end_date="2026-11-01")


# --- visibility ------------------------------------------------------------------

def test_admin_sees_every_project(conn, org):
    names = {p["name"] for p in projects.list_projects(conn, org["admin"], {}, 1, 50)["items"]}
    assert {"Apollo", "Zeus"} <= names


def test_manager_sees_only_projects_they_manage(conn, org):
    names = [p["name"] for p in projects.list_projects(conn, org["bob"], {}, 1, 50)["items"]]
    assert names == ["Apollo"]


def test_employee_sees_only_projects_they_are_booked_on(conn, org):
    names = [p["name"] for p in projects.list_projects(conn, org["alice"], {}, 1, 50)["items"]]
    assert names == ["Apollo"]
    assert projects.list_projects(conn, org["eve"], {}, 1, 50)["items"] == []


def test_not_yours_and_missing_give_byte_identical_404s(conn, org):
    with pytest.raises(NotFound) as not_yours:
        projects.get_project(conn, org["bob"], org["zeus"]["project_id"])
    with pytest.raises(NotFound) as missing:
        projects.get_project(conn, org["bob"], 999_999)
    assert str(not_yours.value) == str(missing.value)


def test_search_and_status_filter(conn, org):
    projects.update_project(conn, org["admin"], org["zeus"]["project_id"], {"status": "ACTIVE"})
    page = projects.list_projects(conn, org["admin"], {"search": "ze", "status": "ACTIVE"}, 1, 50)
    assert [p["name"] for p in page["items"]] == ["Zeus"]


def test_archived_projects_hidden_unless_asked_and_only_admins_can_ask(conn, org):
    projects.archive_project(conn, org["admin"], org["zeus"]["project_id"])
    assert "Zeus" not in {p["name"] for p in projects.list_projects(conn, org["admin"], {}, 1, 50)["items"]}
    shown = projects.list_projects(conn, org["admin"], {"include_archived": True}, 1, 50)["items"]
    assert "Zeus" in {p["name"] for p in shown}
    with pytest.raises(NotFound):
        projects.get_project(conn, org["carol"], org["zeus"]["project_id"])


# --- edit ------------------------------------------------------------------------

def test_manager_edits_description_dates_budget_and_status_of_own_project(conn, org):
    row = projects.update_project(conn, org["bob"], org["apollo"]["project_id"], {
        "description": "Moon", "predicted_end_date": "2027-03-31", "budget_cents": 7_000_000, "status": "ACTIVE"})
    assert (row["description"], row["budget_cents"], row["status"]) == ("Moon", 7_000_000, "ACTIVE")


@pytest.mark.parametrize("field,value", [("name", "Renamed"), ("manager_id", None)])
def test_name_and_manager_are_admin_only(conn, org, field, value):
    value = org["carol"].user_id if field == "manager_id" else value
    with pytest.raises(Forbidden):
        projects.update_project(conn, org["bob"], org["apollo"]["project_id"], {field: value})


def test_admin_renames_and_reassigns(conn, org):
    row = projects.update_project(conn, org["admin"], org["apollo"]["project_id"],
                                  {"name": "Artemis", "manager_id": org["carol"].user_id})
    assert (row["name"], row["manager_id"]) == ("Artemis", org["carol"].user_id)


def test_other_manager_gets_404_and_booked_employee_gets_403(conn, org):
    with pytest.raises(NotFound):
        projects.update_project(conn, org["carol"], org["apollo"]["project_id"], {"description": "x"})
    with pytest.raises(Forbidden):
        projects.update_project(conn, org["alice"], org["apollo"]["project_id"], {"description": "x"})


# --- archive -----------------------------------------------------------------------

def test_archive_cascades_and_reactivate_restores_only_what_it_archived(conn, org):
    ms = f.deliverable(conn, org["bob"], org["apollo"])
    f.task(conn, org["bob"], ms, assignee=org["alice"])
    separately = f.booking(conn, org["admin"], org["apollo"], org["eve"])
    assignments.archive_booking(conn, org["bob"], separately["assignment_id"])

    projects.archive_project(conn, org["admin"], org["apollo"]["project_id"])
    live = conn.execute("SELECT (SELECT count(*) FROM assignments WHERE project_id = %(p)s AND NOT is_archived)"
                        " + (SELECT count(*) FROM milestones WHERE project_id = %(p)s AND NOT is_archived)"
                        " + (SELECT count(*) FROM tasks WHERE project_id = %(p)s AND NOT is_archived) AS n",
                        {"p": org["apollo"]["project_id"]}).fetchone()["n"]
    assert live == 0

    projects.reactivate_project(conn, org["admin"], org["apollo"]["project_id"])
    bookings = conn.execute("SELECT user_id, is_archived FROM assignments WHERE project_id = %s ORDER BY user_id",
                            (org["apollo"]["project_id"],)).fetchall()
    assert bookings == [{"user_id": org["alice"].user_id, "is_archived": False},
                        {"user_id": org["eve"].user_id, "is_archived": True}]


def test_only_admins_archive_projects(conn, org):
    with pytest.raises(Forbidden):
        projects.archive_project(conn, org["bob"], org["apollo"]["project_id"])


# --- bookings ------------------------------------------------------------------------

def test_manager_books_an_employee_on_own_project(conn, org):
    row = f.booking(conn, org["bob"], org["apollo"], org["eve"], hours_per_week=10)
    assert (row["user_id"], row["hours_per_week"]) == (org["eve"].user_id, 10)


def test_only_employees_are_booked(conn, org):
    with pytest.raises(ValidationError) as caught:
        f.booking(conn, org["bob"], org["apollo"], org["carol"])
    assert caught.value.field == "user_id"


def test_overlapping_booking_on_the_same_project_is_a_conflict(conn, org):
    with pytest.raises(Conflict, match="already has a booking"):
        f.booking(conn, org["bob"], org["apollo"], org["alice"], start_date="2026-11-01", end_date="2027-01-31")


def test_other_manager_cannot_book_on_your_project(conn, org):
    with pytest.raises(NotFound):
        f.booking(conn, org["carol"], org["apollo"], org["eve"])


def test_booking_hours_are_1_to_40(conn, org):
    with pytest.raises(ValidationError):
        f.booking(conn, org["bob"], org["apollo"], org["eve"], hours_per_week=41)


def test_update_and_list_bookings(conn, org):
    booking = conn.execute("SELECT assignment_id FROM assignments WHERE user_id = %s",
                           (org["alice"].user_id,)).fetchone()
    assignments.update_booking(conn, org["bob"], booking["assignment_id"], {"hours_per_week": 35})
    listed = assignments.list_bookings(conn, org["alice"], org["apollo"]["project_id"])
    assert [b["hours_per_week"] for b in listed] == [35]
