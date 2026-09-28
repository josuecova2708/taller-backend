import * as fs from 'fs';
import * as path from 'path';
import type { Pool } from '@neondatabase/serverless';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const INITIAL_MIGRATION = '20260926000000_init';

function readMigration(name: string): string {
  const sqlPath = path.join(MIGRATIONS_DIR, name, 'migration.sql');
  return fs.readFileSync(sqlPath, 'utf8').replace(/^﻿/, '');
}

/**
 * Sincroniza el esquema aplicando las migraciones en orden cronológico.
 *
 * Este proyecto no usa `prisma migrate deploy` porque la cadena de conexión de
 * Neon es la *pooled* (`-pooler`), sobre la que el CLI de Prisma no opera. El
 * SQL se aplica por WebSocket/443, que es la vía que funciona en redes
 * restrictivas — el mismo motivo por el que se eligió Neon.
 *
 * CONTRATO: la migración inicial se aplica solo sobre una base vacía. Toda
 * migración posterior se ejecuta en cada corrida, así que **debe ser
 * idempotente** (`IF EXISTS` / `IF NOT EXISTS`, `DROP CONSTRAINT` seguido de
 * `ADD CONSTRAINT`). No se lleva registro de lo ya aplicado.
 *
 * Antes esta lógica vivía dentro de `ensureSchema()` en seed.ts, con la ruta
 * de la migración inicial fija y unos `ALTER TABLE` sueltos escritos a mano.
 * Esa práctica fue la que hizo que la base divergiera de `schema.prisma`; ver
 * la migración `20260928000000_fix_cascade_deletes`.
 */
export async function applyMigrations(pool: Pool): Promise<void> {
  console.log('📦 Verificando esquema en Neon PostgreSQL (vía puerto 443)...');

  const check = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    );
  `);

  if (!check.rows[0].exists) {
    console.log(`🛠️  Base vacía: aplicando migración inicial (${INITIAL_MIGRATION})...`);
    await pool.query(readMigration(INITIAL_MIGRATION));
  }

  const subsequent = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== INITIAL_MIGRATION)
    .map((entry) => entry.name)
    .sort();

  for (const name of subsequent) {
    console.log(`🔧 Aplicando ${name}...`);
    await pool.query(readMigration(name));
  }

  console.log('✅ Esquema sincronizado correctamente en Neon.');
}
