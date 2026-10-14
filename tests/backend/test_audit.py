"""Every change writes an audit row, and that row notifies everyone above the actor.

| Actor (stored role) | Notified                                  |
| Employee            | their line manager and every admin        |
| Manager             | every admin                               |
| Admin               | every other admin                         |
Edge cases: no line manager -> admins only; a lone admin -> nobody; archived users
receive nothing.
"""

import pytest

import factories as f
from services import audit, notifications, users


def recipients_of_last_change(conn):
    rows = conn.execute("SELECT recipient_user_id FROM notifications WHERE audit_id ="
                        " (SELECT max(audit_id) FROM audit_log) ORDER BY 1").fetchall()
    return [r["recipient_user_id"] for r in rows]


@pytest.fixture
def org(conn):
    admin = f.admin(conn)
    admin2, _ = f.person(conn, admin, role="ADMIN", first_name="Ada")
    boss, _ = f.person(conn, admin, role="MANAGER", first_name="Bob")
    alice, _ = f.person(conn, admin, manager=boss, first_name="Alice")
    loner, _ = f.person(conn, admin, first_name="Lone")
    return {"admin": admin, "admin2": admin2, "boss": boss, "alice": alice, "loner": loner}


def test_employee_change_notifies_line_manager_and_admins(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    assert recipients_of_last_change(conn) == sorted([org["boss"].user_id, org["admin"].user_id, org["admin2"].user_id])


def test_employee_without_manager_notifies_admins_only(conn, org):
    users.update_self(conn, org["loner"], {"first_name": "Solo"})
    assert recipients_of_last_change(conn) == sorted([org["admin"].user_id, org["admin2"].user_id])


def test_manager_change_notifies_every_admin(conn, org):
    users.update_self(conn, org["boss"], {"first_name": "Robert"})
    assert recipients_of_last_change(conn) == sorted([org["admin"].user_id, org["admin2"].user_id])


def test_admin_change_notifies_other_admins_only(conn, org):
    users.update_self(conn, org["admin"], {"first_name": "Root"})
    assert recipients_of_last_change(conn) == [org["admin2"].user_id]


def test_lone_admin_notifies_nobody_but_is_still_audited(conn):
    admin = f.admin(conn)
    users.update_self(conn, admin, {"first_name": "Root"})
    last = conn.execute("SELECT * FROM audit_log ORDER BY audit_id DESC LIMIT 1").fetchone()
    assert last["entity_type"] == "users" and last["actor_role"] == "ADMIN"
    assert recipients_of_last_change(conn) == []


def test_archived_users_receive_nothing(conn, org):
    users.archive_user(conn, org["admin"], org["admin2"].user_id)
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    assert recipients_of_last_change(conn) == sorted([org["boss"].user_id, org["admin"].user_id])


def test_audit_row_records_before_and_after_without_password_hash(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    last = conn.execute("SELECT * FROM audit_log ORDER BY audit_id DESC LIMIT 1").fetchone()
    assert (last["before_state"]["firstName"], last["after_state"]["firstName"]) == ("Alice", "Alicia")
    assert "passwordHash" not in last["after_state"] and "password_hash" not in last["after_state"]


def test_notification_text_is_a_summary_without_salary(conn, org):
    users.admin_update(conn, org["admin"], org["alice"].user_id, {"annual_salary_cents": 99_000_00})
    last = conn.execute("SELECT summary FROM audit_log ORDER BY audit_id DESC LIMIT 1").fetchone()["summary"]
    assert "99" not in last and "Alice" in last


def test_role_used_for_recipients_is_the_stored_one(conn, org):
    """Promote Alice; her next change is a manager's change, whatever her old session said."""
    users.admin_update(conn, org["admin"], org["alice"].user_id, {"role": "MANAGER"})
    stale_alice = org["alice"]  # an Actor loaded while she was an employee
    users.update_self(conn, stale_alice, {"first_name": "Alicia"})
    assert recipients_of_last_change(conn) == sorted([org["admin"].user_id, org["admin2"].user_id])


# --- reading notifications -------------------------------------------------

def test_user_lists_and_counts_their_unread_notifications(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    assert notifications.unread_count(conn, org["boss"]) == 1
    page = notifications.list_notifications(conn, org["boss"], unread_only=True, page=1, page_size=10)
    assert page["items"][0]["summary"].startswith("Alicia")


def test_mark_read_only_works_on_your_own(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    note = notifications.list_notifications(conn, org["boss"], unread_only=True, page=1, page_size=10)["items"][0]
    with pytest.raises(Exception) as caught:
        notifications.mark_read(conn, org["loner"], note["notification_id"])
    assert type(caught.value).__name__ == "NotFound"
    notifications.mark_read(conn, org["boss"], note["notification_id"])
    assert notifications.unread_count(conn, org["boss"]) == 0


def test_read_all_clears_the_count(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "A1"})
    users.update_self(conn, org["alice"], {"first_name": "A2"})
    notifications.read_all(conn, org["boss"])
    assert notifications.unread_count(conn, org["boss"]) == 0


def test_admin_filters_the_audit_log(conn, org):
    users.update_self(conn, org["alice"], {"first_name": "Alicia"})
    page = audit.list_audit(conn, org["admin"], {"actor_id": org["alice"].user_id}, page=1, page_size=10)
    assert [r["summary"] for r in page["items"]] == ["Alicia Tester updated their profile"]


def test_only_admins_read_the_audit_log(conn, org):
    with pytest.raises(Exception) as caught:
        audit.list_audit(conn, org["boss"], {}, page=1, page_size=10)
    assert type(caught.value).__name__ == "Forbidden"
