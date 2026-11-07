ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rate_limit_hits FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY system_only ON rate_limit_hits USING (app_system()) WITH CHECK (app_system());
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON rate_limit_hits TO alivia_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE rate_limit_hits_id_seq TO alivia_app;
