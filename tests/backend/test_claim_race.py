"""The two claim races, run for real on separate database connections.

The rest of the suite shares one rolled-back connection, so it can't show two
people pressing Take this at the same moment. Here connection A claims inside
an open transaction, connection B claims in a worker thread, and the test waits
until Postgres reports B blocked on a lock before A commits. A third
connection (`watch`) polls pg_stat_activity: A can't, because inside its open
transaction it would keep seeing the same snapshot.

1. Two people, one Ready task: the task row lock makes B wait, then B sees the
   task taken.
2. One person at 1 of 2, two Ready tasks at once: the person row lock (the
   FOR UPDATE on users in claim_task) makes B wait, then B counts 2 and is
   refused. Without that lock B never waits, and this test fails.
"""

import time
from concurrent.futures import ThreadPoolExecutor, wait

import pytest

import factories as f
from domain.errors import Conflict
from pg import drop_database, recreate_database, settings
from services import tasks
from store import integrity, migrate
from store.postgres import atomic, connect

DB = "tracker_claim_test"


@pytest.fixture
def race_db():
    """A committed world on its own database: Bob manages Alice and Eve, both booked on Apollo."""
    recreate_database(DB)
    try:
        with connect(settings(DB)) as conn:
            migrate.run(conn)
            admin = f.admin(conn)
            bob, _ = f.person(conn, admin, role="MANAGER", first_name="Bob")
            alice, _ = f.person(conn, admin, manager=bob, first_name="Alice")
            eve, _ = f.person(conn, admin, manager=bob, first_name="Eve")
            apollo = f.project(conn, admin, bob, name="Apollo")
            f.booking(conn, bob, apollo, alice)
            f.booking(conn, bob, apollo, eve)
            design = f.deliverable(conn, bob, apollo, name="Design")
        yield {"bob": bob, "alice": alice, "eve": eve, "design": design}
        with connect(settings(DB)) as conn:
            assert integrity.find_violations(conn) == {}
    finally:
        drop_database(DB)


def ready_task(world, **extra):
    """A Ready task (no assignee, TODO) on Design, committed."""
    with connect(settings(DB)) as conn:
        return f.task(conn, world["bob"], world["design"], **extra)


def wait_until_waiting_on_a_lock(watch, pid):
    """Poll until backend `pid` is blocked on a lock; fail after 5 s."""
    for _ in range(100):
        row = watch.execute("SELECT wait_event_type FROM pg_stat_activity WHERE pid = %s", (pid,)).fetchone()
        if row and row["wait_event_type"] == "Lock":
            return
        time.sleep(0.05)
    pytest.fail(f"Connection {pid} never waited on a lock.")


def race(first, second, task_x, task_y):
    """A (`first`) claims task_x and holds its transaction open until B (`second`) waits on task_y.

    Returns B's future, already finished.
    """
    with connect(settings(DB)) as a, connect(settings(DB)) as b, connect(settings(DB)) as watch, \
            ThreadPoolExecutor(max_workers=1) as pool:
        b_pid = b.info.backend_pid
        with atomic(a):
            tasks.claim_task(a, first, task_x)
            future = pool.submit(tasks.claim_task, b, second, task_y)
            wait_until_waiting_on_a_lock(watch, b_pid)
        wait([future], timeout=10)  # B finishes before its connection closes
        return future


def assignee_of(task_id):
    with connect(settings(DB)) as conn:
        return conn.execute("SELECT assignee_user_id FROM tasks WHERE task_id = %s",
                            (task_id,)).fetchone()["assignee_user_id"]


def test_two_people_take_one_task_and_the_second_is_refused(race_db):
    alice, eve = race_db["alice"], race_db["eve"]
    task = ready_task(race_db)["task_id"]
    future = race(alice, eve, task, task)
    with pytest.raises(Conflict, match=r"^This task is already taken\.$"):
        future.result(timeout=10)
    assert assignee_of(task) == alice.user_id


def test_one_person_at_1_of_2_takes_two_tasks_at_once_and_one_is_refused(race_db):
    alice = race_db["alice"]
    ready_task(race_db, assignee=alice)                       # Bob assigned her one: 1 of 2
    x, y = ready_task(race_db)["task_id"], ready_task(race_db)["task_id"]
    future = race(alice, alice, x, y)
    with pytest.raises(Conflict, match=r"^You already hold 2 unfinished tasks, your limit\. Finish one first, or ask your manager to raise it\.$"):
        future.result(timeout=10)
    with connect(settings(DB)) as conn:
        assert tasks.held_count(conn, alice.user_id) == 2
    assert assignee_of(x) == alice.user_id and assignee_of(y) is None
