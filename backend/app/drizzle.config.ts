import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations",
  schema: "./core/schema.ts",
  dialect: "postgresql",
});
