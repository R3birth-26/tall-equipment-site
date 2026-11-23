import { PrismaMariaDb } from "@prisma/adapter-mariadb";

/**
 * MySQL connection for Prisma (SiteGround MySQL in production).
 *
 * DATABASE_URL uses the standard mysql:// form, which the Prisma CLI
 * (migrate, studio) expects. The mariadb driver behind the adapter only
 * accepts mariadb://, so the scheme is swapped here.
 */
export function createDbAdapter() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Expected mysql://USER:PASSWORD@HOST:3306/DATABASE"
    );
  }
  return new PrismaMariaDb(url.replace(/^mysql:\/\//, "mariadb://"));
}
