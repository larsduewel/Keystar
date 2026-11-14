CREATE TABLE "loot_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"fleet_id" bigint,
	"shared" boolean DEFAULT false NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"ledger" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "loot_operations_owner_idx" ON "loot_operations" USING btree ("owner_id","created_at");