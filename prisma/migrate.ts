import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import { applyMigrations } from './apply-migrations';

neonConfig.webSocketConstructor = WebSocket as any;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no está definida. Complete el archivo .env.');
  }

  const isNeon = connectionString.includes('neon.tech');
  const pool = isNeon ? new Pool({ connectionString }) : null;
  const prisma = isNeon
    ? new PrismaClient({ adapter: new PrismaNeon({ connectionString }) } as any)
    : new PrismaClient();

  try {
    await applyMigrations(pool ?? prisma);
  } finally {
    await prisma.$disconnect();
    if (pool) await pool.end();
  }
}

main().catch((error) => {
  console.error('❌ Error aplicando migraciones:', error instanceof Error ? error.message : error);
  process.exit(1);
});
