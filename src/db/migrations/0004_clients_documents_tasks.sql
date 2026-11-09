CREATE TABLE "client_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"received_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"doc_number_enc" text NOT NULL,
	"doc_idx" text NOT NULL,
	"doc_hint" text NOT NULL,
	"doc_dv" text,
	"email_enc" text,
	"phone_enc" text,
	"city" text,
	"responsible_id" uuid,
	"deadline" date,
	"stage" text DEFAULT 'pending' NOT NULL,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"client_document_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"data_enc" "bytea" NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"payload_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"client_id" uuid,
	"title" text NOT NULL,
	"assignee_id" uuid,
	"due_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "client_limit" integer DEFAULT 600 NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "seat_limit" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_client_document_id_client_documents_id_fk" FOREIGN KEY ("client_document_id") REFERENCES "public"."client_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_documents_uq" ON "client_documents" USING btree ("client_id","kind");--> statement-breakpoint
CREATE INDEX "client_documents_firm_idx" ON "client_documents" USING btree ("firm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_firm_doc_uq" ON "clients" USING btree ("firm_id","doc_idx") WHERE "clients"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "clients_firm_stage_idx" ON "clients" USING btree ("firm_id","stage");--> statement-breakpoint
CREATE INDEX "clients_firm_resp_idx" ON "clients" USING btree ("firm_id","responsible_id");--> statement-breakpoint
CREATE INDEX "clients_batch_idx" ON "clients" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "document_files_doc_idx" ON "document_files" USING btree ("client_document_id");--> statement-breakpoint
CREATE INDEX "document_files_firm_idx" ON "document_files" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "import_batches_firm_idx" ON "import_batches" USING btree ("firm_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_firm_status_idx" ON "tasks" USING btree ("firm_id","status","due_date");--> statement-breakpoint
CREATE INDEX "tasks_client_idx" ON "tasks" USING btree ("client_id");