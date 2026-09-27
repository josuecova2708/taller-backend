import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, UserRole, VehicleStatus, DtcType, MonitorStatus, ScanSeverity, WorkOrderStatus, WorkOrderPriority } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import * as bcrypt from 'bcrypt';

neonConfig.webSocketConstructor = WebSocket as any;

const connectionString = process.env.DATABASE_URL || '';
const pool = new Pool({ connectionString });
const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter } as any);

async function ensureSchema() {
  console.log('📦 Verificando tablas en Neon PostgreSQL (vía puerto 443)...');
  const check = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'users'
    );
  `);

  if (!check.rows[0].exists) {
    console.log('🛠️ Aplicando migración inicial (migration.sql) vía WebSocket 443...');
    const sqlPath = path.join(__dirname, 'migrations', '20260926000000_init', 'migration.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8').replace(/^\uFEFF/, '');
    await pool.query(sql);
    console.log('✅ Tablas e índices creados correctamente en Neon.');
  } else {
    console.log('✅ El esquema ya existe en Neon.');
  }
}

async function main() {
  await ensureSchema();

  console.log('🌱 Iniciando seed de datos de prueba...');

  const passwordHash = await bcrypt.hash('taller123', 10);

  // 1. Usuarios de prueba
  const admin = await prisma.user.upsert({
    where: { email: 'admin@uagrm.edu.bo' },
    update: {},
    create: {
      email: 'admin@uagrm.edu.bo',
      name: 'Administrador Flota UAGRM',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const inspector = await prisma.user.upsert({
    where: { email: 'inspector@uagrm.edu.bo' },
    update: {},
    create: {
      email: 'inspector@uagrm.edu.bo',
      name: 'Carlos Inspector',
      passwordHash,
      role: UserRole.INSPECTOR,
    },
  });

  const mechanic = await prisma.user.upsert({
    where: { email: 'mecanico@uagrm.edu.bo' },
    update: {},
    create: {
      email: 'mecanico@uagrm.edu.bo',
      name: 'Roberto Mecánico',
      passwordHash,
      role: UserRole.MECHANIC,
    },
  });

  // 2. Vehículos de prueba (incluyendo Toyota Tacoma real de pruebas)
  const tacoma = await prisma.vehicle.upsert({
    where: { plate: '5521-TAC' },
    update: {},
    create: {
      vin: '5TFCZ5AN3MX255216',
      plate: '5521-TAC',
      alias: 'Camioneta Facultad Ciencias Agrícolas',
      make: 'Toyota',
      model: 'Tacoma',
      year: 2021,
      status: VehicleStatus.CRITICAL,
    },
  });

  const hilux = await prisma.vehicle.upsert({
    where: { plate: '4012-UAG' },
    update: {},
    create: {
      vin: '8AJBA3CD201928374',
      plate: '4012-UAG',
      alias: 'Camioneta Veterinaria Campo',
      make: 'Toyota',
      model: 'Hilux',
      year: 2019,
      status: VehicleStatus.ALERT,
    },
  });

  const coaster = await prisma.vehicle.upsert({
    where: { plate: '3110-BUS' },
    update: {},
    create: {
      vin: 'JTGFB518701122334',
      plate: '3110-BUS',
      alias: 'Minibús Transporte Estudiantil #3',
      make: 'Toyota',
      model: 'Hiace',
      year: 2020,
      status: VehicleStatus.OK,
    },
  });

  // 3. Escaneo de prueba (Datos reales de la Tacoma) si no existe
  const existingScans = await prisma.scan.count({ where: { vehicleId: tacoma.id } });
  if (existingScans === 0) {
    const scanTacoma = await prisma.scan.create({
      data: {
        vehicleId: tacoma.id,
        scannedById: inspector.id,
        batteryVoltage: 13.3,
        scannedAt: new Date(),
        severity: ScanSeverity.HIGH,
        aiProcessed: true,
        rawPayload: {
          vin: '5TFCZ5AN3MX255216',
          batteryVoltage: 13.3,
          dtcs: [
            { code: 'P0300', type: 'PERMANENT', monitorStatus: 'COMPLETED' },
            { code: 'P0301', type: 'PERMANENT', monitorStatus: 'COMPLETED' },
            { code: 'P2195', type: 'PENDING', monitorStatus: 'NOT_COMPLETED' },
          ],
        },
        dtcEntries: {
          create: [
            { code: 'P0300', type: DtcType.PERMANENT, monitorStatus: MonitorStatus.COMPLETED },
            { code: 'P0301', type: DtcType.PERMANENT, monitorStatus: MonitorStatus.COMPLETED },
            { code: 'P2195', type: DtcType.PENDING, monitorStatus: MonitorStatus.NOT_COMPLETED },
          ],
        },
      },
    });

    const diagnosisTacoma = await prisma.diagnosis.create({
      data: {
        scanId: scanTacoma.id,
        provider: 'gemini',
        prompt: 'Analizar DTCs P0300 (PERMANENT), P0301 (PERMANENT), P2195 (PENDING, NOT_COMPLETED) para Toyota Tacoma 2021',
        response: 'Falla de encendido detectada en cilindro 1 con historial permanente.',
        summary: 'Fallo de encendido en el cilindro 1 (P0301) acompañado de código de fallo aleatorio (P0300). El código P2195 tiene monitor incompleto tras reinicio reciente.',
        severity: 'HIGH',
        recommendations: [
          'Inspeccionar y reemplazar bujía del cilindro 1 si presenta desgaste',
          'Verificar bobina de encendido del cilindro 1 intercambiándola con otro cilindro',
          'Revisar compresión y cableado del inyector del cilindro 1',
        ],
        tokensUsed: 420,
        latencyMs: 1450,
      },
    });

    await prisma.workOrder.create({
      data: {
        scanId: scanTacoma.id,
        diagnosisId: diagnosisTacoma.id,
        vehicleId: tacoma.id,
        assignedToId: mechanic.id,
        status: WorkOrderStatus.OPEN,
        priority: WorkOrderPriority.HIGH,
        description: 'Revisión urgente de sistema de encendido cilindro 1 (P0300 / P0301)',
        notes: 'Generada automáticamente tras escaneo OBD-II.',
        n8nNotified: true,
      },
    });
  }

  console.log('✅ Seed completado exitosamente en Neon:', {
    users: [admin.email, inspector.email, mechanic.email],
    vehicles: [tacoma.plate, hilux.plate, coaster.plate],
  });
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
