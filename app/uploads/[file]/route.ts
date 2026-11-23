import { readFile } from "node:fs/promises";
import path from "node:path";
import { ALLOWED_PHOTO_TYPES, UPLOAD_DIR } from "@/lib/storage";

// Serves admin-uploaded photos from UPLOAD_DIR (see lib/storage.ts).
// Filenames are random UUIDs, so responses can be cached forever.
const SAFE_NAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  const type = ALLOWED_PHOTO_TYPES[path.extname(file).toLowerCase()];

  if (!SAFE_NAME.test(file) || !type) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const data = await readFile(path.join(UPLOAD_DIR, file));
    return new Response(data, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
