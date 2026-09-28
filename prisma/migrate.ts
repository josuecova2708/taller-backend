import 'dotenv/config';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import { applyMigrations } from './apply-migrations';

neonConfig.webSocketConstructor = WebSocket as any;

/**
 * Aplica las migraciones SIN sembrar datos.
 *
 * `npm run seed:dev` también las aplica, pero además inserta datos de prueba
 * con `create` (no `upsert`), de modo que re-ejecutarlo duplica escaneos y
 * órdenes. Este comando existe para sincronizar el esquema de una base que ya
 * tiene datos reales.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL no está definida. Complete el archivo .env.');
  }

  const pool = new Pool({ connectionString });

  try {
    await applyMigrations(pool);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('❌ Error aplicando migraciones:', error instanceof Error ? error.message : error);
  process.exit(1);
});
