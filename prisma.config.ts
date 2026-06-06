// Prisma 7 configuration — database URL lives here, not in schema.prisma.
// Set DATABASE_URL in .env.local (dev) or your deployment environment (prod).
// Supported hosts: Supabase, Railway, Neon, PlanetScale (use mysql:// for PlanetScale)

import { defineConfig } from 'prisma/config';

export default defineConfig({
  datasourceUrl: process.env.DATABASE_URL,
});
