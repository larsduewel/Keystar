CREATE TABLE "map_skyhook_snapshot" (
	"id" integer PRIMARY KEY NOT NULL,
	"skyhooks" jsonb NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"source_at" timestamp with time zone NOT NULL
);
