// Custom entry point for SiteGround's Node.js hosting.
// Honors the PORT SiteGround assigns, and applies any pending database
// migrations (creates/updates the MySQL tables) before the site starts.
// Migrations run here rather than at build time because SiteGround's
// environment variables (DATABASE_URL) are only guaranteed at runtime.
const { createServer } = require("node:http");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const next = require("next");

// Logs what DATABASE_URL resolves to (never the password itself) and the
// exact MySQL error, so connection problems can be diagnosed from the log.
async function checkDatabase() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    console.error("[db-check] DATABASE_URL is not a valid URL. Expected mysql://USER:PASSWORD@HOST:3306/DBNAME");
    return;
  }
  const password = decodeURIComponent(url.password);
  console.log(
    "[db-check] " +
      JSON.stringify({
        scheme: url.protocol,
        user: decodeURIComponent(url.username),
        host: url.hostname,
        port: url.port || "(default 3306)",
        database: url.pathname.replace(/^\//, ""),
        passwordLength: password.length,
        passwordHasSpecialChars: /[^A-Za-z0-9]/.test(password),
        valueHasSpacesOrQuotes: raw !== raw.trim() || /["'\s]/.test(raw),
        extraOptions: url.search || "(none)",
      })
  );
  try {
    const mariadb = require("mariadb");
    const conn = await mariadb.createConnection({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password,
      database: url.pathname.replace(/^\//, ""),
      connectTimeout: 5000,
    });
    const [row] = await conn.query("SELECT CURRENT_USER() AS currentUser, VERSION() AS version");
    console.log("[db-check] connected OK as " + row.currentUser + " (MySQL " + row.version + ")");
    await conn.end();
  } catch (error) {
    console.error("[db-check] connection FAILED: " + (error.code || "") + " " + (error.sqlMessage || error.message));
  }
}

// Logs where the app runs and whether UPLOAD_DIR is usable, so the photo
// folder can be placed outside the per-deploy build folder.
function checkUploadDir() {
  const fs = require("node:fs");
  const os = require("node:os");
  console.log("[paths] " + JSON.stringify({ cwd: process.cwd(), home: os.homedir() }));
  const dir = process.env.UPLOAD_DIR;
  if (!dir) {
    console.warn("[paths] UPLOAD_DIR is not set: admin photo uploads will be lost on the next deploy.");
    return;
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".write-test");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    const files = fs.readdirSync(dir).filter((f) => !f.startsWith(".")).length;
    console.log("[paths] UPLOAD_DIR OK: " + dir + " (" + files + " files)");
  } catch (error) {
    console.error("[paths] UPLOAD_DIR not writable: " + dir + " (" + error.code + ")");
  }
}

function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set: skipping migrations. Set it in Site Tools > Node.js.");
    return;
  }
  const prismaCli = path.join(__dirname, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: __dirname,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error("Database migration failed (see above). Starting the site anyway.");
  }
}

async function main() {
  checkUploadDir();
  await checkDatabase();
  migrate();

  const port = process.env.PORT || 3000;
  const app = next({ dev: false });
  const handle = app.getRequestHandler();

  await app.prepare();
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`Tall Equipment & Machinery site listening on port ${port}`);
  });
}

main();
