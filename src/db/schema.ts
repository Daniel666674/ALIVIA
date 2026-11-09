import { sql } from "drizzle-orm";
import {
  customType,
  date,
  bigint,
  bigserial,
  boolean,
  check,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const firms = pgTable("firms", {
  id: id(),
  name: text("name").notNull(),
  /** Plan limits (Phase 1): enforced by the app, editable per firm. */
  clientLimit: integer("client_limit").notNull().default(600),
  seatLimit: integer("seat_limit").notNull().default(4),
  createdAt: createdAt(),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// Global catalog (not tenant-scoped).
export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  description: text("description").notNull(),
});

export const roles = pgTable(
  "roles",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("roles_firm_key_uq").on(t.firmId, t.key)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: integer("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    /** Always stored lowercased + trimmed (enforced by CHECK). */
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    /** AES-GCM encrypted base32 TOTP secret (see lib/crypto.ts). */
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    /** Last accepted TOTP time-step, to block code replay. */
    totpLastStep: bigint("totp_last_step", { mode: "number" }),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    index("users_firm_idx").on(t.firmId),
    check("users_email_normalized", sql`${t.email} = lower(btrim(${t.email}))`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the cookie token. The raw token is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** NULL = password OK but second factor not yet proven; session grants nothing. */
    mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_firm_idx").on(t.firmId)],
);

export const recoveryCodes = pgTable(
  "recovery_codes",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("recovery_user_idx").on(t.userId)],
);

/** Pre-auth throttling record; keyed by HMAC of the email so no raw emails are stored. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    emailHash: text("email_hash").notNull(),
    ip: inet("ip"),
    success: boolean("success").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_at_idx").on(t.emailHash, t.at)],
);

/** Append-only (enforced by trigger + grants). Never put secrets or PII in `meta`. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    firmId: uuid("firm_id").references(() => firms.id),
    userId: uuid("user_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_firm_at_idx").on(t.firmId, t.at)],
);

/** Product-usage telemetry for onboarding: what people click and where they get stuck. Never holds client data. */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    userId: uuid("user_id").notNull(),
    event: text("event").notNull(),
    path: text("path").notNull(),
    meta: jsonb("meta").$type<Record<string, string | number | boolean>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_firm_at_idx").on(t.firmId, t.at), index("usage_firm_event_idx").on(t.firmId, t.event)],
);

/** Sliding-window hits for the DB-backed rate limiter (used when Redis isn't configured). */
export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    bucket: text("bucket").notNull(),
    key: text("key").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_limit_hits_lookup_idx").on(t.bucket, t.key, t.at)],
);

export const CLIENT_KINDS = ["natural", "empresa"] as const;
export const CLIENT_STAGES = ["pending", "in_preparation", "in_review", "presented"] as const;
export const DOC_KINDS = ["bank_cert", "rut", "dian_key", "id_doc"] as const;
export const DOC_STATUSES = ["pending", "received", "reviewed"] as const;

export const clients = pgTable(
  "clients",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    kind: text("kind", { enum: CLIENT_KINDS }).notNull(),
    name: text("name").notNull(),
    /** AES-GCM encrypted ID number (cédula / NIT without check digit). */
    docNumberEnc: text("doc_number_enc"),
    /** HMAC blind index: equality search + uniqueness without decrypting. */
    docIdx: text("doc_idx"),
    /** Last 3 digits, shown in lists (the full number is only decrypted on the client's page). */
    docHint: text("doc_hint").notNull(),
    docDv: text("doc_dv"),
    emailEnc: text("email_enc"),
    phoneEnc: text("phone_enc"),
    city: text("city"),
    responsibleId: uuid("responsible_id").references(() => users.id),
    deadline: date("deadline", { mode: "string" }),
    stage: text("stage", { enum: CLIENT_STAGES }).notNull().default("pending"),
    importBatchId: uuid("import_batch_id"),
    /** Follow-up marks used by the next-best-action engine (all manual, no automation). */
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** Agreed fee in COP (whole pesos). */
    feeCop: bigint("fee_cop", { mode: "number" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("clients_firm_doc_uq").on(t.firmId, t.docIdx).where(sql`${t.deletedAt} IS NULL`),
    index("clients_firm_stage_idx").on(t.firmId, t.stage),
    index("clients_firm_resp_idx").on(t.firmId, t.responsibleId),
    index("clients_batch_idx").on(t.importBatchId),
  ],
);

export const clientDocuments = pgTable(
  "client_documents",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: DOC_KINDS }).notNull(),
    status: text("status", { enum: DOC_STATUSES }).notNull().default("pending"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by"),
  },
  (t) => [uniqueIndex("client_documents_uq").on(t.clientId, t.kind), index("client_documents_firm_idx").on(t.firmId)],
);

/** Encrypted file bytes (demo storage in Postgres; moves to private object storage later). */
export const documentFiles = pgTable(
  "document_files",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    clientDocumentId: uuid("client_document_id").notNull().references(() => clientDocuments.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    dataEnc: bytea("data_enc").notNull(),
    uploadedBy: uuid("uploaded_by"),
    uploadedAt: createdAt(),
  },
  (t) => [index("document_files_doc_idx").on(t.clientDocumentId), index("document_files_firm_idx").on(t.firmId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id),
    dueDate: date("due_date", { mode: "string" }),
    status: text("status", { enum: ["open", "done"] }).notNull().default("open"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("tasks_firm_status_idx").on(t.firmId, t.status, t.dueDate), index("tasks_client_idx").on(t.clientId)],
);

export const clientNotes = pgTable(
  "client_notes",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull(),
    bodyEnc: text("body_enc").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("client_notes_client_idx").on(t.clientId, t.createdAt)],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: id(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    userId: uuid("user_id").notNull(),
    filename: text("filename").notNull(),
    status: text("status", { enum: ["draft", "applied", "rolled_back"] }).notNull().default("draft"),
    totalRows: integer("total_rows").notNull().default(0),
    created: integer("created").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    /** Encrypted JSON of parsed rows while a draft; wiped as soon as the import is applied or expires. */
    payloadEnc: text("payload_enc"),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  },
  (t) => [index("import_batches_firm_idx").on(t.firmId, t.createdAt)],
);
