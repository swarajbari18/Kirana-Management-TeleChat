import {
  drizzle,
  type DrizzleSqliteDODatabase,
} from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from "../../../drizzle/migrations.js";
import * as schema from "./schema.js";

export type StoreDatabase = DrizzleSqliteDODatabase<typeof schema>;

export function createDatabase(storage: DurableObjectStorage): StoreDatabase {
  return drizzle(storage, { schema });
}

export async function runDrizzleMigrations(db: StoreDatabase): Promise<void> {
  migrate(db, migrations as Parameters<typeof migrate>[1]);
}
