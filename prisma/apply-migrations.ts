import * as fs from 'fs';
import * as path from 'path';
import type { Pool } from '@neondatabase/serverless';
import type { PrismaClient } from '@prisma/client';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const INITIAL_MIGRATION = '20260926000000_init';

function readMigration(name: string): string {
  const sqlPath = path.join(MIGRATIONS_DIR, name, 'migration.sql');
  return fs.readFileSync(sqlPath, 'utf8').replace(/^﻿/, '');
}

/**
 * Divide un script SQL en sentencias individuales, respetando bloques `DO $$ ... END $$;`.
 * Esto permite ejecutar migraciones tanto en Neon Pool como en PrismaClient ($executeRawUnsafe).
 */
function splitSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements: string[] = [];
  let current = '';
  let inDollarBlock = false;

  for (let i = 0; i < withoutComments.length; i++) {
    const ch = withoutComments[i];
    const next = withoutComments[i + 1];

    if (ch === '$' && next === '$') {
      inDollarBlock = !inDollarBlock;
      current += '$$';
      i++;
      continue;
    }

    if (ch === ';' && !inDollarBlock) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
    } else {
      current += ch;
    }
  }

  const remaining = current.trim();
  if (remaining.length > 0) {
    statements.push(remaining);
  }

  return statements;
}

export interface SqlExecutor {
  checkTableExists(tableName: string): Promise<boolean>;
  executeSql(sql: string): Promise<void>;
}

export function createPoolExecutor(pool: Pool): SqlExecutor {
  return {
    async checkTableExists(tableName: string) {
      const check = await pool.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1);`,
        [tableName],
      );
      return Boolean(check.rows[0]?.exists);
    },
    async executeSql(sql: string) {
      await pool.query(sql);
    },
  };
}

export function createPrismaExecutor(prisma: PrismaClient): SqlExecutor {
  return {
    async checkTableExists(tableName: string) {
      const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '${tableName}') AS "exists";`,
      );
      return Boolean(rows[0]?.exists);
    },
    async executeSql(sql: string) {
      const statements = splitSqlStatements(sql);
      for (const stmt of statements) {
        await prisma.$executeRawUnsafe(stmt);
      }
    },
  };
}

export async function applyMigrations(target: Pool | PrismaClient): Promise<void> {
  const isPrisma = '$executeRawUnsafe' in target;
  const executor = isPrisma
    ? createPrismaExecutor(target as PrismaClient)
    : createPoolExecutor(target as Pool);

  console.log('📦 Verificando esquema en PostgreSQL...');

  const exists = await executor.checkTableExists('users');

  if (!exists) {
    console.log(`🛠️  Base vacía: aplicando migración inicial (${INITIAL_MIGRATION})...`);
    await executor.executeSql(readMigration(INITIAL_MIGRATION));
  }

  const subsequent = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== INITIAL_MIGRATION)
    .map((entry) => entry.name)
    .sort();

  for (const name of subsequent) {
    console.log(`🔧 Aplicando ${name}...`);
    await executor.executeSql(readMigration(name));
  }

  console.log('✅ Esquema sincronizado correctamente (24 tablas).');
}
