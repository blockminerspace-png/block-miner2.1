-- Trap any DELETE on users (Prisma, raw SQL, psql, pgAdmin, etc.).
-- Writes an audit_logs row capturing who/what was removed so silent deletions
-- never happen again.

CREATE OR REPLACE FUNCTION audit_user_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (action, source, severity, label, description, metadata, ip, user_agent, created_at)
  VALUES (
    'user_deleted_db_trigger',
    'database',
    'warn',
    'User #' || OLD.id || ' deleted',
    'Email: ' || COALESCE(OLD.email, '(none)') || ' | Username: ' || COALESCE(OLD.username, '(none)'),
    jsonb_build_object(
      'deletedUserId',  OLD.id,
      'email',          OLD.email,
      'username',       OLD.username,
      'name',           OLD.name,
      'createdAt',      OLD.created_at,
      'lastLoginAt',    OLD.last_login_at,
      'registrationIp', OLD.registration_ip,
      'isBanned',       OLD.is_banned,
      'polBalance',     OLD.pol_balance,
      'sessionUser',    current_user
    ),
    NULL,
    'pg-trigger:audit_user_delete',
    NOW()
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_user_delete ON users;
CREATE TRIGGER trg_audit_user_delete
  AFTER DELETE ON users
  FOR EACH ROW
  EXECUTE FUNCTION audit_user_delete();
