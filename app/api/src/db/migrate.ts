import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { env } from "../env";

const client = postgres(env.databaseUrl, { max: 1 });
const database = drizzle(client);

await migrate(database, { migrationsFolder: "./drizzle" });
await client.end();

console.log("Vocalonix database migrations applied.");
