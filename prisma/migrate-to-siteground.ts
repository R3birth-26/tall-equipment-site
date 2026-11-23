// One-time move: Turso (libSQL) + Vercel Blob  ->  SiteGround MySQL + UPLOAD_DIR.
//
// Copies every Equipment, Photo and AdminUser row (ids, timestamps and
// password hashes unchanged, so admin logins keep working), downloads each
// photo hosted on Vercel Blob into UPLOAD_DIR and points it at /uploads/<file>.
// Photos already served from /public (e.g. /images/flyers/...) are left as is.
//
// Env:
//   TURSO_DATABASE_URL, TURSO_AUTH_TOKEN   source (read only, never modified)
//   DATABASE_URL=mysql://...               target MySQL (tables must exist:
//                                          run `npx prisma migrate deploy` first)
//   UPLOAD_DIR=/abs/path                   target photo folder
//
// Usage:
//   npx tsx prisma/migrate-to-siteground.ts --dry-run   report only, writes nothing
//   npx tsx prisma/migrate-to-siteground.ts             copy into an EMPTY target
//   npx tsx prisma/migrate-to-siteground.ts --replace   wipe the target first, then copy
import { createClient, type Row } from "@libsql/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../app/generated/prisma/client";
import { createDbAdapter } from "../lib/db-adapter";

const dryRun = process.argv.includes("--dry-run");
const replace = process.argv.includes("--replace");

function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing env var ${name}. See the header of this file.`);
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
const toInt = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const toStr = (v: unknown) => (v === null || v === undefined ? null : String(v));
const toBool = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";

const isRemote = (url: string) => /^https?:\/\//i.test(url);

async function main() {
  const turso = createClient({
    url: need("TURSO_DATABASE_URL"),
    authToken: need("TURSO_AUTH_TOKEN"),
  });

  const [equipmentRes, photoRes, adminRes] = await Promise.all([
    turso.execute("SELECT * FROM Equipment"),
    turso.execute('SELECT * FROM Photo ORDER BY equipmentId, "order"'),
    turso.execute("SELECT * FROM AdminUser"),
  ]);

  const remotePhotos = photoRes.rows.filter((p) => isRemote(String(p.url)));
  const localPhotos = photoRes.rows.filter((p) => !isRemote(String(p.url)));

  console.log("Source (Turso):");
  console.log(`  equipment listings: ${equipmentRes.rows.length}`);
  console.log(`  photos:             ${photoRes.rows.length}`);
  console.log(`    to download:      ${remotePhotos.length} (Vercel Blob / remote)`);
  console.log(`    kept as is:       ${localPhotos.length} (served from the site, e.g. /images/...)`);
  console.log(`  admin users:        ${adminRes.rows.length}`);

  const unservable = localPhotos.filter((p) => String(p.url).startsWith("/uploads/"));
  if (unservable.length) {
    console.warn(
      `  WARNING: ${unservable.length} photo(s) point at /uploads/ on the old host and have no file to copy:`
    );
    for (const p of unservable) console.warn(`    ${p.id}  ${p.url}`);
  }

  if (dryRun) {
    console.log("\nDry run: nothing written.");
    return;
  }

  const uploadDir = need("UPLOAD_DIR");
  need("DATABASE_URL");
  const prisma = new PrismaClient({ adapter: createDbAdapter() });

  try {
    const existing =
      (await prisma.equipment.count()) + (await prisma.photo.count()) + (await prisma.adminUser.count());
    if (existing > 0 && !replace) {
      console.error(
        `\nTarget MySQL already has ${existing} row(s). Re-run with --replace to wipe it and copy again.`
      );
      process.exit(1);
    }

    // 1. Download photos first, so a failed download stops before any DB write.
    await mkdir(uploadDir, { recursive: true });
    const newUrl = new Map<string, string>();
    let done = 0;
    for (const p of remotePhotos) {
      const url = String(p.url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed (${res.status}) for photo ${p.id}: ${url}`);
      const ext = (path.extname(new URL(url).pathname) || ".jpg").toLowerCase();
      const filename = `${randomUUID()}${ext}`;
      await writeFile(path.join(uploadDir, filename), Buffer.from(await res.arrayBuffer()));
      newUrl.set(String(p.id), `/uploads/${filename}`);
      done++;
      if (done % 10 === 0 || done === remotePhotos.length) {
        console.log(`  downloaded ${done}/${remotePhotos.length} photos`);
      }
    }

    // 2. Write all rows in one transaction: either everything lands or nothing does.
    await prisma.$transaction(async (tx) => {
      if (replace) {
        await tx.photo.deleteMany();
        await tx.equipment.deleteMany();
        await tx.adminUser.deleteMany();
      }

      await tx.equipment.createMany({
        data: equipmentRes.rows.map((e: Row) => ({
          id: String(e.id),
          category: String(e.category),
          year: toInt(e.year),
          make: String(e.make),
          model: String(e.model),
          trim: toStr(e.trim),
          stockNumber: toStr(e.stockNumber),
          serialNumber: toStr(e.serialNumber),
          hours: toInt(e.hours),
          mileage: toInt(e.mileage),
          condition: String(e.condition),
          color: toStr(e.color),
          transmission: toStr(e.transmission),
          driveType: toStr(e.driveType),
          fuelType: toStr(e.fuelType),
          engine: toStr(e.engine),
          description: toStr(e.description),
          cashPrice: Number(e.cashPrice),
          financePrice: toInt(e.financePrice),
          monthlyPrice: toInt(e.monthlyPrice),
          status: String(e.status),
          featured: toBool(e.featured),
          createdAt: toDate(e.createdAt),
          updatedAt: toDate(e.updatedAt),
        })),
      });

      await tx.photo.createMany({
        data: photoRes.rows.map((p: Row) => ({
          id: String(p.id),
          url: newUrl.get(String(p.id)) ?? String(p.url),
          order: Number(p.order),
          equipmentId: String(p.equipmentId),
        })),
      });

      await tx.adminUser.createMany({
        data: adminRes.rows.map((a: Row) => ({
          id: String(a.id),
          email: String(a.email),
          passwordHash: String(a.passwordHash),
          createdAt: toDate(a.createdAt),
        })),
      });
    }, { timeout: 120_000 });

    // 3. Verify.
    const counts = {
      equipment: await prisma.equipment.count(),
      photos: await prisma.photo.count(),
      admins: await prisma.adminUser.count(),
    };
    const ok =
      counts.equipment === equipmentRes.rows.length &&
      counts.photos === photoRes.rows.length &&
      counts.admins === adminRes.rows.length;

    console.log("\nTarget (MySQL):");
    console.log(`  equipment listings: ${counts.equipment}`);
    console.log(`  photos:             ${counts.photos} (${newUrl.size} files saved to ${uploadDir})`);
    console.log(`  admin users:        ${counts.admins}`);
    console.log(ok ? "\nAll counts match. Done." : "\nCOUNTS DO NOT MATCH. Check the output above.");
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
