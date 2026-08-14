ALTER TABLE "bookings" ADD COLUMN "customer_phone" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "callback_tasks" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "callback_tasks" ADD CONSTRAINT "callback_tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_contact_idx" ON "bookings" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "callback_tasks_contact_idx" ON "callback_tasks" USING btree ("contact_id");