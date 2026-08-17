CREATE TABLE "demo_agents" (
	"vertical" text PRIMARY KEY NOT NULL,
	"workflow_id" integer NOT NULL,
	"workflow_uuid" text,
	"embed_token" text NOT NULL,
	"config_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
