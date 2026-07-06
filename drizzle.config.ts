import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // drizzle-kit talks to Postgres directly — it needs the UNPOOLED URL.
    url: process.env.DATABASE_URL_UNPOOLED ?? '',
  },
});
