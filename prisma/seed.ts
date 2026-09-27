import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, UserRole, VehicleStatus, DtcType, ScanSeverity, WorkOrderStatus, WorkOrderPriority } from '@prisma/client';
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
  console.log('📦 Verificando esquema en Neon PostgreSQL (vía puerto 443)...');
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
  }

  // Asegurar migración de Fase 2 (readinessStatus global en Scan, eliminar monitorStatus por DTC)
  await pool.query(`
    ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "readinessStatus" JSONB;
    ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "notes" TEXT;
    ALTER TABLE "dtc_entries" DROP COLUMN IF EXISTS "monitorStatus";
    DROP TYPE IF EXISTS "MonitorStatus";
  `);
  console.log('✅ Esquema sincronizado correctamente en Neon.');
}

async function main() {
  await ensureSchema();

  console.log('🌱 Sembrando datos de prueba en Neon...');

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

  // 2. Vehículos de prueba
  const tacoma = await prisma.vehicle.upsert({
    where: { plate: '5521-TAC' },
    update: { status: VehicleStatus.CRITICAL },
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
    update: { status: VehicleStatus.ALERT },
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
    update: { status: VehicleStatus.ALERT },
    create: {
      vin: 'JTGFB518701122334',
      plate: '3110-BUS',
      alias: 'Minibús Transporte Estudiantil #3',
      make: 'Toyota',
      model: 'Hiace',
      year: 2020,
      status: VehicleStatus.ALERT,
    },
  });

  // Limpiar escaneos previos para recrear con readinessStatus global limpio
  await prisma.workOrder.deleteMany({});
  await prisma.diagnosis.deleteMany({});
  await prisma.dtcEntry.deleteMany({});
  await prisma.scan.deleteMany({});

  // 3. Caso 1: Escaneo de la Toyota Tacoma (Falla recurrente P0300/P0301)
  const scanTacoma = await prisma.scan.create({
    data: {
      vehicleId: tacoma.id,
      scannedById: inspector.id,
      batteryVoltage: 13.3,
      scannedAt: new Date(),
      severity: ScanSeverity.HIGH,
      aiProcessed: true,
      notes: 'Inspección previa a viaje de prácticas a Okinawa.',
      readinessStatus: {
        milOn: true,
        dtcCount: 2,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 82 07 65 00',
      },
      rawPayload: {
        vin: '5TFCZ5AN3MX255216',
        batteryVoltage: 13.3,
        readiness: '41 01 82 07 65 00',
        dtcs: [
          { code: 'P0300', type: 'CONFIRMED' },
          { code: 'P0301', type: 'CONFIRMED' },
          { code: 'P0300', type: 'PERMANENT' },
          { code: 'P0301', type: 'PERMANENT' },
        ],
      },
      dtcEntries: {
        create: [
          { code: 'P0300', type: DtcType.CONFIRMED },
          { code: 'P0301', type: DtcType.CONFIRMED },
          { code: 'P0300', type: DtcType.PERMANENT },
          { code: 'P0301', type: DtcType.PERMANENT },
        ],
      },
    },
  });

  const diagnosisTacoma = await prisma.diagnosis.create({
    data: {
      scanId: scanTacoma.id,
      provider: 'claude',
      prompt: 'Analizar DTCs P0300 (CONFIRMED/PERMANENT), P0301 (CONFIRMED/PERMANENT) con monitores completos para Toyota Tacoma 2021',
      response: 'Hipótesis técnica: fallo de encendido activo y recurrente focalizado en cilindro 1.',
      summary: 'Hipótesis técnica: Se detectan códigos confirmados y permanentes de fallo de encendido en cilindro 1 (P0301) y aleatorio (P0300) con monitores completados. Requiere evaluación mecánica antes de autorizar salida a campo.',
      severity: 'HIGH',
      recommendations: [
        'Hipótesis 1: Evaluar estado de bujía y bobina de encendido del cilindro 1',
        'Hipótesis 2: Verificar cableado y pulso del inyector del cilindro 1',
        'Decisión formal sujeta a validación del responsable técnico de taller',
      ],
      tokensUsed: 410,
      latencyMs: 1320,
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
      description: 'Evaluación mecánica prioritaria de sistema de encendido cilindro 1 (P0300 / P0301)',
      notes: 'Hipótesis generada por asistente IA. Requiere validación humana antes de autorizar viaje.',
      n8nNotified: true,
    },
  });

  // 4. Caso 2: Minibús tras desconexión de batería (P2195 Pending + Monitores incompletos -> Seguimiento)
  await prisma.scan.create({
    data: {
      vehicleId: coaster.id,
      scannedById: inspector.id,
      batteryVoltage: 12.6,
      scannedAt: new Date(Date.now() - 3600 * 1000),
      severity: ScanSeverity.LOW,
      aiProcessed: false,
      notes: 'Batería desconectada en taller el fin de semana para limpieza de bornes. Re-escanear tras completar ciclo de conducción.',
      readinessStatus: {
        milOn: false,
        dtcCount: 0,
        monitorsCompleted: false,
        incompleteMonitors: ['Catalizador', 'Sensor de Oxígeno', 'EVAP'],
        rawHex: '41 01 00 07 65 25',
        batteryResetSuspected: true,
      },
      rawPayload: {
        vin: 'JTGFB518701122334',
        batteryVoltage: 12.6,
        readiness: '41 01 00 07 65 25',
        dtcs: [
          { code: 'P2195', type: 'PENDING' },
        ],
      },
      dtcEntries: {
        create: [
          { code: 'P2195', type: DtcType.PENDING },
        ],
      },
    },
  });

  console.log('✅ Seed actualizado exitosamente en Neon:', {
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
