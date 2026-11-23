// Custom entry point for SiteGround's Node.js hosting.
// Honors the PORT SiteGround assigns, and applies any pending database
// migrations (creates/updates the MySQL tables) before the site starts.
// Migrations run here rather than at build time because SiteGround's
// environment variables (DATABASE_URL) are only guaranteed at runtime.
const { createServer } = require("node:http");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const next = require("next");

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

migrate();

const port = process.env.PORT || 3000;
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`Tall Equipment & Machinery site listening on port ${port}`);
  });
});
