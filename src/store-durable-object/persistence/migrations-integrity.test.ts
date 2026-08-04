import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import journal from "../../../drizzle/meta/_journal.json";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const migrationsJs = readFileSync(join(repoRoot, "drizzle/migrations.js"), "utf8");

describe("drizzle migration journal integrity", () => {
  it("lists a journal entry for every bundled migration import", () => {
    const importedMigrationKeys = [
      ...migrationsJs.matchAll(/import\s+m(\d{4})\s+from/g),
    ].map((match) => `m${match[1]}`);

    const journalIdxs = journal.entries.map((entry) =>
      `m${entry.idx.toString().padStart(4, "0")}`,
    );

    expect(journalIdxs).toEqual(importedMigrationKeys);
  });

  it("includes billing migration 0005 in the journal", () => {
    const billingEntry = journal.entries.find((entry) =>
      entry.tag.includes("0005_component_5_2_billing"),
    );
    expect(billingEntry).toBeDefined();
    expect(billingEntry?.idx).toBe(5);
  });
});
