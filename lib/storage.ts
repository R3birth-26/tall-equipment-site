import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Where admin-uploaded photos live on disk.
 *
 * On SiteGround, set UPLOAD_DIR to a folder OUTSIDE the deployed app
 * (each GitHub deploy replaces the app folder, which would wipe photos
 * kept inside it). Locally it defaults to ./uploads (git-ignored).
 *
 * Files are served by app/uploads/[file]/route.ts, not from /public:
 * Next.js only serves public/ files that existed at build time.
 */
export const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads");

export const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

/** Saves an uploaded photo and returns its public URL (/uploads/<file>). */
export async function savePhoto(file: File): Promise<string> {
  const ext = path.extname(file.name).toLowerCase();
  const safeExt = ext in ALLOWED_PHOTO_TYPES ? ext : ".jpg";
  const filename = `${randomUUID()}${safeExt}`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), buffer);
  return `/uploads/${filename}`;
}
