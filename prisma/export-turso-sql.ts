// Exports every Equipment, Photo and AdminUser row from Turso as a MySQL
// .sql file for phpMyAdmin > Import. Ids, timestamps and password hashes are
// copied unchanged, so admin logins keep working.
//
// The file first EMPTIES those three tables, then inserts, all in one
// transaction, so it is safe to re-import (e.g. a fresh export on go-live day).
// Photos must already be served by the site (/images/...): any remote photo
// URL (Vercel Blob) is reported and the export stops; use
// migrate-to-siteground.ts for those instead.
//
// Env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (read only)
// Usage: npx tsx prisma/export-turso-sql.ts [output.sql]
//        default output: migration-export/tall-equipment-data.sql (git-ignored)
import { createClient, type Row } from "@libsql/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const out = process.argv[2] ?? path.join("migration-export", "tall-equipment-data.sql");

function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing env var ${name}.`);
    process.exit(1);
  }
  return value;
}

// Prisma's SQLite storage may hold DateTime as epoch ms or as ISO text.
function toDate(value: unknown): Date {
  if (typeof value === "number" || typeof value === "bigint") return new Date(Number(value));
  if (typeof value === "string" && /^\d+$/.test(value)) return new Date(Number(value));
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`Unreadable date: ${String(value)}`);
  return date;
}

// MySQL literals. Dates as UTC 'YYYY-MM-DD HH:MM:SS.mmm' (Prisma stores UTC).
const sqlString = (v: string) =>
  "'" +
  v.replace(/[\0\n\r\x1a'"\\]/g, (c) =>
    ({ "\0": "\\0", "\n": "\\n", "\r": "\\r", "\x1a": "\\Z", "'": "\\'", '"': '\\"', "\\": "\\\\" })[c]!
  ) +
  "'";
const str = (v: unknown) => (v === null || v === undefined ? "NULL" : sqlString(String(v)));
const int = (v: unknown) => {
  if (v === null || v === undefined) return "NULL";
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`Not an integer: ${String(v)}`);
  return String(n);
};
const bool = (v: unknown) => (v === true || v === 1 || v === "1" || v === "true" ? "1" : "0");
const date = (v: unknown) => sqlString(toDate(v).toISOString().replace("T", " ").replace("Z", ""));

function insert(table: string, columns: string[], rows: string[][]) {
  if (rows.length === 0) return `-- ${table}: no rows\n`;
  const cols = columns.map((c) => `\`${c}\``).join(", ");
  return (
    `INSERT INTO \`${table}\` (${cols}) VALUES\n` +
    rows.map((r) => `  (${r.join(", ")})`).join(",\n") +
    ";\n"
  );
}

async function main() {
  const turso = createClient({ url: need("TURSO_DATABASE_URL"), authToken: need("TURSO_AUTH_TOKEN") });
  const [equipment, photos, admins] = await Promise.all([
    turso.execute("SELECT * FROM Equipment ORDER BY createdAt"),
    turso.execute('SELECT * FROM Photo ORDER BY equipmentId, "order"'),
    turso.execute("SELECT * FROM AdminUser ORDER BY createdAt"),
  ]);

  const remote = photos.rows.filter((p) => /^https?:\/\//i.test(String(p.url)));
  if (remote.length) {
    console.error(`${remote.length} photo(s) are remote (Vercel Blob). Use migrate-to-siteground.ts instead.`);
    process.exit(1);
  }

  const equipmentCols = [
    "id", "category", "year", "make", "model", "trim", "stockNumber", "serialNumber", "hours",
    "mileage", "condition", "color", "transmission", "driveType", "fuelType", "engine",
    "description", "cashPrice", "financePrice", "monthlyPrice", "status", "featured",
    "createdAt", "updatedAt",
  ];
  const equipmentRows = equipment.rows.map((e: Row) => [
    str(e.id), str(e.category), int(e.year), str(e.make), str(e.model), str(e.trim),
    str(e.stockNumber), str(e.serialNumber), int(e.hours), int(e.mileage), str(e.condition),
    str(e.color), str(e.transmission), str(e.driveType), str(e.fuelType), str(e.engine),
    str(e.description), int(e.cashPrice), int(e.financePrice), int(e.monthlyPrice),
    str(e.status), bool(e.featured), date(e.createdAt), date(e.updatedAt),
  ]);
  const photoRows = photos.rows.map((p: Row) => [str(p.id), str(p.url), int(p.order), str(p.equipmentId)]);
  const adminRows = admins.rows.map((a: Row) => [str(a.id), str(a.email), str(a.passwordHash), date(a.createdAt)]);

  const sql =
    `-- Tall Equipment & Machinery: data exported from Turso on ${new Date().toISOString()}\n` +
    `-- ${equipmentRows.length} equipment, ${photoRows.length} photos, ${adminRows.length} admin users.\n` +
    `-- Import in phpMyAdmin into the site's database. Replaces all rows in these tables.\n\n` +
    `SET NAMES utf8mb4;\nSET time_zone = '+00:00';\nSTART TRANSACTION;\n\n` +
    "DELETE FROM `Photo`;\nDELETE FROM `Equipment`;\nDELETE FROM `AdminUser`;\n\n" +
    insert("Equipment", equipmentCols, equipmentRows) + "\n" +
    insert("Photo", ["id", "url", "order", "equipmentId"], photoRows) + "\n" +
    insert("AdminUser", ["id", "email", "passwordHash", "createdAt"], adminRows) + "\n" +
    "COMMIT;\n";

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, sql, "utf8");
  console.log(`Wrote ${out}`);
  console.log(`  equipment: ${equipmentRows.length}, photos: ${photoRows.length}, admin users: ${adminRows.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
