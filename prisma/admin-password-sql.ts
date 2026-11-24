// Sets (or creates) an admin login by writing a .sql file for phpMyAdmin > Import.
// The password is typed hidden in the terminal and only its bcrypt hash is written.
//
// Usage: npx tsx prisma/admin-password-sql.ts someone@example.com
// Output: migration-export/admin-password.sql (git-ignored). Delete it after importing.
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: npx tsx prisma/admin-password-sql.ts someone@example.com");
  process.exit(1);
}

// Reads one line from the terminal without echoing it. Keeps leftover input
// between calls, so it also works when lines are piped in.
let pending = "";
function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const finish = (value: string) => {
      stdin.setRawMode?.(false);
      stdin.pause();
      stdin.off("data", onData);
      process.stdout.write("\n");
      resolve(value);
    };
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === "\u0003") process.exit(130);
        pending += c;
      }
      const match = pending.match(/^([^\r\n]*)(\r\n|\r|\n)/);
      if (!match) return;
      pending = pending.slice(match[0].length);
      let line = "";
      for (const c of match[1]) line = c === "\b" || c === "\u007f" ? line.slice(0, -1) : line + c;
      finish(line);
    };
    stdin.setRawMode?.(true);
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    stdin.resume();
    if (pending) onData("");
  });
}

async function main() {
  const password = await askHidden(`New password for ${email} (hidden, 8+ chars): `);
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if ((await askHidden("Type it again: ")) !== password) throw new Error("Passwords did not match.");

  const hash = await bcrypt.hash(password, 10);
  const sql =
    `-- Sets the admin password for ${email} (creates the login if missing).\n` +
    `INSERT INTO \`AdminUser\` (\`id\`, \`email\`, \`passwordHash\`, \`createdAt\`)\n` +
    `VALUES ('${randomUUID()}', '${email}', '${hash}', UTC_TIMESTAMP(3))\n` +
    `ON DUPLICATE KEY UPDATE \`passwordHash\` = VALUES(\`passwordHash\`);\n`;

  await mkdir("migration-export", { recursive: true });
  await writeFile("migration-export/admin-password.sql", sql, "utf8");
  console.log("Wrote migration-export/admin-password.sql. Import it in phpMyAdmin, then delete the file.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
