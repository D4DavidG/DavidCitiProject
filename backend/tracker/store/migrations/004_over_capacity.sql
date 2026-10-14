-- 004_over_capacity: marks time logged past weekly capacity without overtime allowed.
-- Design: docs/superpowers/specs/2026-10-14-overtime-design.md
ALTER TABLE time_entries ADD COLUMN over_capacity BOOLEAN NOT NULL DEFAULT false;
