CREATE TABLE "gatecheck_feed" (
	"id" smallint PRIMARY KEY NOT NULL,
	"coverage_since" timestamp with time zone NOT NULL,
	"caught_up_at" timestamp with time zone,
	"last_killmail_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gatecheck_kills" (
	"killmail_id" bigint PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"killmail_time" timestamp with time zone NOT NULL,
	"solar_system_id" bigint NOT NULL,
	"gate_id" bigint,
	"gate_distance_m" double precision,
	"victim_character_id" bigint,
	"victim_corporation_id" bigint,
	"victim_alliance_id" bigint,
	"victim_ship_type_id" integer NOT NULL,
	"total_value" double precision DEFAULT 0 NOT NULL,
	"attacker_count" smallint NOT NULL,
	"attacker_character_ids" bigint[] NOT NULL,
	"attacker_corporation_ids" bigint[] NOT NULL,
	"attacker_alliance_ids" bigint[] NOT NULL,
	"attacker_ship_type_ids" integer[] NOT NULL,
	"attacker_weapon_type_ids" integer[] NOT NULL,
	"npc" boolean DEFAULT false NOT NULL,
	"concord" boolean DEFAULT false NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intel_dscan_lookups" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_orders" (
	"order_id" bigint PRIMARY KEY NOT NULL,
	"character_id" bigint NOT NULL,
	"type_id" integer NOT NULL,
	"region_id" integer NOT NULL,
	"location_id" bigint NOT NULL,
	"is_buy_order" boolean NOT NULL,
	"is_corporation" boolean NOT NULL,
	"price" double precision NOT NULL,
	"volume_total" bigint NOT NULL,
	"volume_remain" bigint NOT NULL,
	"min_volume" bigint,
	"escrow" double precision,
	"range" text NOT NULL,
	"duration" integer NOT NULL,
	"issued" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"closed_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills_implant_attributes" (
	"type_id" integer PRIMARY KEY NOT NULL,
	"charisma" smallint DEFAULT 0 NOT NULL,
	"intelligence" smallint DEFAULT 0 NOT NULL,
	"memory" smallint DEFAULT 0 NOT NULL,
	"perception" smallint DEFAULT 0 NOT NULL,
	"willpower" smallint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills_implants" (
	"character_id" bigint NOT NULL,
	"type_id" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_implants_character_id_type_id_pk" PRIMARY KEY("character_id","type_id")
);
--> statement-breakpoint
CREATE TABLE "appraisal_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "seen_version" text;--> statement-breakpoint
ALTER TABLE "skills_character" ADD COLUMN "implants_synced_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "gatecheck_kills_system_time_idx" ON "gatecheck_kills" USING btree ("solar_system_id","killmail_time");--> statement-breakpoint
CREATE INDEX "gatecheck_kills_time_idx" ON "gatecheck_kills" USING btree ("killmail_time");--> statement-breakpoint
CREATE INDEX "intel_dscan_lookups_user_idx" ON "intel_dscan_lookups" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "market_orders_character_idx" ON "market_orders" USING btree ("character_id","state");--> statement-breakpoint
CREATE INDEX "market_orders_location_idx" ON "market_orders" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "appraisal_attempts_user_idx" ON "appraisal_attempts" USING btree ("user_id","created_at");