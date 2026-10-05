CREATE TABLE "industry_jobs" (
	"job_id" bigint PRIMARY KEY NOT NULL,
	"character_id" bigint NOT NULL,
	"installer_id" bigint NOT NULL,
	"location_id" bigint NOT NULL,
	"facility_id" bigint NOT NULL,
	"station_id" bigint,
	"activity_id" integer NOT NULL,
	"activity" text NOT NULL,
	"blueprint_id" bigint NOT NULL,
	"blueprint_type_id" integer NOT NULL,
	"blueprint_location_id" bigint NOT NULL,
	"output_location_id" bigint NOT NULL,
	"product_type_id" integer,
	"runs" integer NOT NULL,
	"licensed_runs" integer,
	"successful_runs" integer,
	"probability" double precision,
	"cost" double precision DEFAULT 0 NOT NULL,
	"duration" integer NOT NULL,
	"status" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"pause_date" timestamp with time zone,
	"completed_date" timestamp with time zone,
	"completed_character_id" bigint,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "industry_locations" (
	"location_id" bigint PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"solar_system_id" bigint,
	"type_id" integer,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mining_pnl_fee_overrides" (
	"user_id" uuid NOT NULL,
	"character_id" bigint NOT NULL,
	"journal_id" bigint NOT NULL,
	"included" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mining_pnl_fee_overrides_user_id_character_id_journal_id_pk" PRIMARY KEY("user_id","character_id","journal_id")
);
--> statement-breakpoint
CREATE TABLE "skills_character" (
	"character_id" bigint PRIMARY KEY NOT NULL,
	"total_sp" bigint,
	"unallocated_sp" bigint,
	"charisma" smallint,
	"intelligence" smallint,
	"memory" smallint,
	"perception" smallint,
	"willpower" smallint,
	"bonus_remaps" smallint,
	"last_remap_date" timestamp with time zone,
	"accrued_remap_cooldown_date" timestamp with time zone,
	"queue_synced_at" timestamp with time zone,
	"skills_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skills_character_skills" (
	"character_id" bigint NOT NULL,
	"skill_id" integer NOT NULL,
	"trained_level" smallint NOT NULL,
	"active_level" smallint NOT NULL,
	"skillpoints" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_character_skills_character_id_skill_id_pk" PRIMARY KEY("character_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "skills_queue" (
	"character_id" bigint NOT NULL,
	"queue_position" smallint NOT NULL,
	"skill_id" integer NOT NULL,
	"finished_level" smallint NOT NULL,
	"start_date" timestamp with time zone,
	"finish_date" timestamp with time zone,
	"training_start_sp" integer,
	"level_start_sp" integer,
	"level_end_sp" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_queue_character_id_queue_position_pk" PRIMARY KEY("character_id","queue_position")
);
--> statement-breakpoint
CREATE TABLE "skills_type_attributes" (
	"type_id" integer PRIMARY KEY NOT NULL,
	"primary_attribute" integer NOT NULL,
	"secondary_attribute" integer NOT NULL,
	"rank" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_fees" (
	"character_id" bigint NOT NULL,
	"journal_id" bigint NOT NULL,
	"user_id" uuid NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"ref_type" text NOT NULL,
	"amount" double precision NOT NULL,
	"context_id" bigint,
	"context_id_type" text,
	"description" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_fees_character_id_journal_id_pk" PRIMARY KEY("character_id","journal_id")
);
--> statement-breakpoint
ALTER TABLE "mining_pnl_characters" ADD COLUMN "auto_include_sales" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mining_pnl_settings" ADD COLUMN "income_source" text DEFAULT 'mined' NOT NULL;--> statement-breakpoint
ALTER TABLE "mining_pnl_fee_overrides" ADD CONSTRAINT "mining_pnl_fee_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_fees" ADD CONSTRAINT "wallet_fees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "industry_jobs_character_idx" ON "industry_jobs" USING btree ("character_id","status");--> statement-breakpoint
CREATE INDEX "industry_jobs_location_idx" ON "industry_jobs" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "industry_jobs_end_idx" ON "industry_jobs" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "skills_character_skills_skill_idx" ON "skills_character_skills" USING btree ("skill_id","trained_level");--> statement-breakpoint
CREATE INDEX "wallet_fees_user_date_idx" ON "wallet_fees" USING btree ("user_id","date");