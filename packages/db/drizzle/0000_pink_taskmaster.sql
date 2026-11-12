CREATE TABLE "users" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(128) NOT NULL,
	"password_hash" text,
	"role" varchar(32) DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "host_agents" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"identifier" varchar(128) NOT NULL,
	"name" varchar(128) NOT NULL,
	"os" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'offline' NOT NULL,
	"token_hash" text NOT NULL,
	"capabilities" jsonb,
	"last_heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_agents_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"host_id" varchar(64) NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"token_hash" text NOT NULL,
	"role" varchar(32) DEFAULT 'viewer' NOT NULL,
	"project_root" text NOT NULL,
	"allowed_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"actor_id" varchar(64) NOT NULL,
	"target_id" varchar(64),
	"ip_address" varchar(64),
	"user_agent" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_host_id_host_agents_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."host_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;