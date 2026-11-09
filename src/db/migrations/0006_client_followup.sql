ALTER TABLE "clients" ADD COLUMN "last_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "fee_cop" bigint;