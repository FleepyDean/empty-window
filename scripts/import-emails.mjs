// Import email variations into the EmailAccount pool.
//
// Usage:
//   node scripts/import-emails.mjs <path-to-file>
//
// Supported file formats:
//   - .json: array of strings OR array of { email, used? }
//             e.g. ["r.edshocker33@gmail.com", "re.dshocker33@gmail.com"]
//             or   [{"email":"r.edshocker33@gmail.com","used":true}, ...]
//   - .csv:  two columns: "CBTL Email", "Used"  (Used = ✅/yes/true → mark as used)
//   - .txt:  one email per line
//
// To export your Excel: File → Save As → CSV (Comma delimited).

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseCsv(content) {
  // Very small CSV parser — handles quoted fields and ✅/yes/true for "used".
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const out = [];
  // Detect header
  let startIdx = 0;
  const first = lines[0].toLowerCase();
  if (first.includes("email")) startIdx = 1;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    const email = cols[0];
    const usedRaw = (cols[1] ?? "").toLowerCase().trim();
    const used =
      usedRaw === "true" ||
      usedRaw === "yes" ||
      usedRaw === "y" ||
      usedRaw === "1" ||
      usedRaw.includes("✅") ||
      usedRaw.includes("✓");
    if (email && email.includes("@")) {
      out.push({ email: email.toLowerCase(), used });
    }
  }
  return out;
}

function parseJson(content) {
  const data = JSON.parse(content);
  if (!Array.isArray(data)) throw new Error("JSON file must be an array");
  return data.map((item) => {
    if (typeof item === "string") return { email: item.toLowerCase(), used: false };
    return {
      email: String(item.email).toLowerCase(),
      used: Boolean(item.used)
    };
  });
}

function parseTxt(content) {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.includes("@"))
    .map((email) => ({ email: email.toLowerCase(), used: false }));
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/import-emails.mjs <file.csv|file.json|file.txt>");
    process.exit(1);
  }
  const abs = path.resolve(file);
  const content = fs.readFileSync(abs, "utf8");
  const ext = path.extname(abs).toLowerCase();

  let entries;
  if (ext === ".json") entries = parseJson(content);
  else if (ext === ".csv") entries = parseCsv(content);
  else entries = parseTxt(content);

  console.log(`Parsed ${entries.length} entries from ${abs}`);

  let created = 0;
  let skipped = 0;
  for (const entry of entries) {
    try {
      await prisma.emailAccount.upsert({
        where: { emailAddress: entry.email },
        create: {
          emailAddress: entry.email,
          status: entry.used ? "used" : "available",
          assignedAt: entry.used ? new Date() : null
        },
        update: {
          // Only update status if currently available — never resurrect a used email
          status: entry.used ? "used" : undefined
        }
      });
      created++;
    } catch (err) {
      console.error(`  Skipped ${entry.email}:`, err.message);
      skipped++;
    }
  }

  const stats = {
    available: await prisma.emailAccount.count({ where: { status: "available" } }),
    used: await prisma.emailAccount.count({ where: { status: "used" } }),
    disabled: await prisma.emailAccount.count({ where: { status: "disabled" } })
  };
  console.log(`Imported: ${created}, Skipped: ${skipped}`);
  console.log(`Pool: available=${stats.available}, used=${stats.used}, disabled=${stats.disabled}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
