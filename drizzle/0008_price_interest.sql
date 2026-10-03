CREATE TABLE "price_interest" (
	"type_id" integer PRIMARY KEY NOT NULL,
	"last_requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
