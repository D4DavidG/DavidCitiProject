-- 005_sessions: refresh tokens, and the time of each user's last password change.
-- Design: docs/superpowers/specs/2026-10-14-tokens-design.md
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;  -- NULL: never changed, no cut-off

-- Only the SHA-256 of each refresh token is stored, so a database leak gives nobody a usable token.
CREATE TABLE refresh_tokens (
    refresh_token_id BIGSERIAL PRIMARY KEY,
    user_id          BIGINT      NOT NULL REFERENCES users(user_id),
    token_hash       TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL,
    expires_at       TIMESTAMPTZ NOT NULL,                       -- fixed at login, copied on rotation
    revoked_at       TIMESTAMPTZ,
    replaced_by      BIGINT      REFERENCES refresh_tokens(refresh_token_id),
    CONSTRAINT refresh_tokens_hash_unique UNIQUE (token_hash),
    CONSTRAINT refresh_tokens_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT refresh_tokens_expiry_after_creation CHECK (expires_at > created_at),
    CONSTRAINT refresh_tokens_replaced_needs_revoked CHECK (replaced_by IS NULL OR revoked_at IS NOT NULL)
);
CREATE INDEX refresh_tokens_live ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE TRIGGER no_delete BEFORE DELETE ON refresh_tokens FOR EACH ROW EXECUTE FUNCTION refuse_change();
