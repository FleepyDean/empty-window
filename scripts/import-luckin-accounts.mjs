import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

/**
 * Import Luckin Coffee accounts from a CSV or JSON file
 * CSV format: email,password,voucherExpiresAt (optional, YYYY-MM-DD)
 * JSON format: [{ "email": "...", "password": "...", "voucherExpiresAt": "2025-12-31" }]
 */
async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.log("Usage: node import-luckin-accounts.mjs <path-to-file>");
    console.log("");
    console.log("Supports CSV (email,password,expiry) or JSON [{email,password,voucherExpiresAt}] format");
    console.log("Expiry date is optional (YYYY-MM-DD format)");
    process.exit(1);
  }

  const fullPath = path.resolve(filePath);
  const ext = path.extname(fullPath).toLowerCase();
  
  let accounts = [];
  
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    
    if (ext === ".json") {
      accounts = JSON.parse(content);
    } else if (ext === ".csv") {
      // Parse CSV
      const lines = content.split("\n").filter(l => l.trim());
      // Skip header if present
      const startIdx = lines[0].includes("email") ? 1 : 0;
      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].split(",").map(s => s.trim());
        const email = parts[0];
        const password = parts[1];
        const voucherExpiresAt = parts[2] || null;
        if (email && password) {
          accounts.push({ email, password, voucherExpiresAt });
        }
      }
    } else {
      console.error("Unsupported file format. Use .csv or .json");
      process.exit(1);
    }
  } catch (err) {
    console.error("Failed to read file:", err.message);
    process.exit(1);
  }

  console.log(`Found ${accounts.length} accounts to import...`);

  let inserted = 0;
  let skipped = 0;

  for (const account of accounts) {
    try {
      const expiryDate = account.voucherExpiresAt ? new Date(account.voucherExpiresAt) : null;
      await prisma.luckinAccount.upsert({
        where: { email: account.email },
        update: { 
          password: account.password,
          ...(expiryDate && { voucherExpiresAt: expiryDate })
        },
        create: {
          email: account.email,
          password: account.password,
          status: "available",
          ...(expiryDate && { voucherExpiresAt: expiryDate })
        }
      });
      inserted++;
      console.log(`✓ ${account.email}${expiryDate ? ` (expires: ${account.voucherExpiresAt})` : ""}`);
    } catch (err) {
      console.error(`✗ Failed to insert ${account.email}:`, err.message);
      skipped++;
    }
  }

  console.log(`\nDone! Inserted/Updated: ${inserted}, Failed: ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
