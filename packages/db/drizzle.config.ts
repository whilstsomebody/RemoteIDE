import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./dist/schema/index.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://remoteide:remoteide_dev_pass@localhost:5432/remoteide_db",
  },
  strict: true,
  verbose: true,
});
