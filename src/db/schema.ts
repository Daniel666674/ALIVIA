import { sql } from "drizzle-orm";
import {
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
  createdAt: createdAt(),
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
