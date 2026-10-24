-- Least-privilege application role + Row Level Security (defense in depth behind app-level checks).
-- The app connects as the table owner but ALWAYS runs queries after `SET LOCAL ROLE alivia_app`
-- (see src/db/client.ts), so RLS applies even where the provider's owner role would bypass it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'alivia_app') THEN
    CREATE ROLE alivia_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT alivia_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO alivia_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_firm() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.firm_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_system() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('app.system', true), '') = 'on' $$;
--> statement-breakpoint
GRANT SELECT ON firms, permissions, role_permissions, roles TO alivia_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON users TO alivia_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions, recovery_codes TO alivia_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON login_attempts TO alivia_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_log TO alivia_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE audit_log_id_seq, login_attempts_id_seq TO alivia_app;
--> statement-breakpoint
ALTER TABLE firms ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE firms FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON firms USING (id = app_firm() OR app_system()) WITH CHECK (app_system());
--> statement-breakpoint
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON roles USING (firm_id = app_firm() OR app_system()) WITH CHECK (firm_id = app_firm() OR app_system());
--> statement-breakpoint
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON users USING (firm_id = app_firm() OR app_system()) WITH CHECK (firm_id = app_firm() OR app_system());
--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON sessions USING (firm_id = app_firm() OR app_system()) WITH CHECK (firm_id = app_firm() OR app_system());
--> statement-breakpoint
ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE recovery_codes FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON recovery_codes USING (firm_id = app_firm() OR app_system()) WITH CHECK (firm_id = app_firm() OR app_system());
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_log USING (firm_id = app_firm() OR app_system()) WITH CHECK (firm_id = app_firm() OR app_system());
--> statement-breakpoint
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE login_attempts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY system_only ON login_attempts USING (app_system()) WITH CHECK (app_system());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS
  $$ BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
