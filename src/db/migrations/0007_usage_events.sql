CREATE TABLE "usage_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"firm_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event" text NOT NULL,
	"path" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_firm_at_idx" ON "usage_events" USING btree ("firm_id","at");--> statement-breakpoint
CREATE INDEX "usage_firm_event_idx" ON "usage_events" USING btree ("firm_id","event");--> statement-breakpoint
GRANT SELECT, INSERT ON usage_events TO alivia_app;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE usage_events_id_seq TO alivia_app;
--> statement-breakpoint
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE usage_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON usage_events USING (firm_id = app_firm() OR app_system()) WITH CHECK (firm_id = app_firm() OR app_system());
