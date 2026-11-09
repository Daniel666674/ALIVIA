-- RLS + least-privilege grants for the Phase 1 business tables (same model as 0001).
GRANT SELECT, INSERT, UPDATE, DELETE ON clients, client_documents, document_files, tasks, import_batches TO alivia_app;
--> statement-breakpoint
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON clients USING (firm_id = app_firm() OR app_system()) WITH CHECK (firm_id = app_firm() OR app_system());
--> statement-breakpoint
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE client_documents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON client_documents USING (firm_id = app_firm() OR app_system()) WITH CHECK (firm_id = app_firm() OR app_system());
--> statement-breakpoint
ALTER TABLE document_files ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE document_files FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON document_files USING (firm_id = app_firm() OR app_system()) WITH CHECK (firm_id = app_firm() OR app_system());
--> statement-breakpoint
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON tasks USING (firm_id = app_firm() OR app_system()) WITH CHECK (firm_id = app_firm() OR app_system());
--> statement-breakpoint
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE import_batches FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON import_batches USING (firm_id = app_firm() OR app_system()) WITH CHECK (firm_id = app_firm() OR app_system());
