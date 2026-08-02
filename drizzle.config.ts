import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/store-durable-object/persistence/schema.ts",
  dialect: "sqlite",
  driver: "durable-sqlite",
});
