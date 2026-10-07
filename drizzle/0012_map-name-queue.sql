CREATE TABLE "map_name_queue" (
	"id" bigint NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "map_name_queue_id_kind_pk" PRIMARY KEY("id","kind")
);
