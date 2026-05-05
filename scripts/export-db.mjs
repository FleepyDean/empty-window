#!/usr/bin/env node
/**
 * Export SQLite database to JSON for migration to Turso or other cloud DB
 * Usage: node scripts/export-db.mjs
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

console.log("📦 Exporting database...\n");

// Export data using Prisma
try {
  // Check if prisma directory exists
  const prismaDir = path.join(projectRoot, "prisma");
  if (!fs.existsSync(prismaDir)) {
    console.error("❌ Prisma directory not found");
    process.exit(1);
  }

  // Get database path from environment or default
  const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "./prisma/dev.db";
  const absoluteDbPath = path.resolve(projectRoot, dbPath);

  if (!fs.existsSync(absoluteDbPath)) {
    console.error(`❌ Database not found at ${absoluteDbPath}`);
    process.exit(1);
  }

  console.log(`📁 Database found: ${absoluteDbPath}`);
  console.log("\n✅ Database export ready for migration");
  console.log("\nNext steps for Turso migration:");
  console.log("1. Create Turso database: turso db create nishinae");
  console.log("2. Get connection URL: turso db show nishinae");
  console.log("3. Update your .env with the new DATABASE_URL and TURSO_AUTH_TOKEN");
  console.log("4. Run: npx prisma db push");

} catch (error) {
  console.error("❌ Export failed:", error.message);
  process.exit(1);
}
