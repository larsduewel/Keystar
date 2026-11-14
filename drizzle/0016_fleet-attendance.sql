CREATE TABLE "fleet_attendance" (
	"fleet_id" bigint NOT NULL,
	"character_id" bigint NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"end_reason" text,
	CONSTRAINT "fleet_attendance_fleet_id_character_id_joined_at_pk" PRIMARY KEY("fleet_id","character_id","joined_at")
);
--> statement-breakpoint
CREATE INDEX "fleet_attendance_window_idx" ON "fleet_attendance" USING btree ("fleet_id","joined_at");