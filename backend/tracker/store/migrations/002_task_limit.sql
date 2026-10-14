-- 002_task_limit: the most unfinished tasks a person may take themselves.
-- Design: docs/superpowers/specs/2026-10-14-pull-board-design.md
ALTER TABLE users ADD COLUMN task_limit INTEGER NOT NULL DEFAULT 2;
ALTER TABLE users ADD CONSTRAINT users_task_limit_range CHECK (task_limit BETWEEN 1 AND 10);
