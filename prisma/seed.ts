import 'dotenv/config';
import {
  PrismaClient,
  UserRole,
  VehicleStatus,
  DtcType,
  ScanSeverity,
  WorkOrderStatus,
  WorkOrderPriority,
  NotificationChannel,
  NotificationStatus,
} from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';
import * as bcrypt from 'bcrypt';
import { applyMigrations } from './apply-migrations';
import { STATIC_OBD_DICTIONARY } from '../src/obd/dtc-dictionary';

neonConfig.webSocketConstructor = WebSocket as any;

const connectionString = process.env.DATABASE_URL || '';
const isNeon = connectionString.includes('neon.tech');
const pool = isNeon ? new Pool({ connectionString }) : null;
const prisma = isNeon
  ? new PrismaClient({ adapter: new PrismaNeon({ connectionString }) } as any)
  : new PrismaClient();

const HORA = 3600 * 1000;
const DIA = 24 * HORA;

function haceDias(dias: number, horasExtra = 0): Date {
  return new Date(Date.now() - dias * DIA - horasExtra * HORA);
}

async function main() {
  await applyMigrations(pool ?? prisma);

  console.log('🌱 Sembrando las 23 tablas con 5 organizaciones, 5 inspectores, 5 mecánicos y 12 vehículos...');

  const passwordHash = await bcrypt.hash('taller123', 10);

  // --------------------------------------------------------------------------
  // 1. 5 ORGANIZACIONES / UNIDADES ORGANIZACIONALES (organizational_units)
  // --------------------------------------------------------------------------
  const orgAgricolas = await prisma.organizationalUnit.upsert({
    where: { code: 'FCA-UAGRM' },
    update: { name: 'Facultad de Ciencias Agrícolas', type: 'FACULTAD', parentId: null },
    create: {
      code: 'FCA-UAGRM',
      name: 'Facultad de Ciencias Agrícolas',
      type: 'FACULTAD',
    },
  });

  const orgExactas = await prisma.organizationalUnit.upsert({
    where: { code: 'FCET-UAGRM' },
    update: { name: 'Facultad de Ciencias Exactas y Tecnología', type: 'FACULTAD', parentId: null },
    create: {
      code: 'FCET-UAGRM',
      name: 'Facultad de Ciencias Exactas y Tecnología',
      type: 'FACULTAD',
    },
  });

  const orgVeterinaria = await prisma.organizationalUnit.upsert({
    where: { code: 'FMVZ-UAGRM' },
    update: {
      name: 'Facultad de Medicina Veterinaria y Zootecnia',
      type: 'FACULTAD',
      parentId: null,
    },
    create: {
      code: 'FMVZ-UAGRM',
      name: 'Facultad de Medicina Veterinaria y Zootecnia',
      type: 'FACULTAD',
    },
  });

  const orgComputacion = await prisma.organizationalUnit.upsert({
    where: { code: 'FICCT-UAGRM' },
    update: {
      name: 'Facultad de Ingeniería en Ciencias de la Computación y Telecomunicaciones',
      type: 'FACULTAD',
      parentId: null,
    },
    create: {
      code: 'FICCT-UAGRM',
      name: 'Facultad de Ingeniería en Ciencias de la Computación y Telecomunicaciones',
      type: 'FACULTAD',
    },
  });

  const orgPolitecnica = await prisma.organizationalUnit.upsert({
    where: { code: 'FP-UAGRM' },
    update: {
      name: 'Facultad Politécnica y Transporte Universitario',
      type: 'FACULTAD',
      parentId: null,
    },
    create: {
      code: 'FP-UAGRM',
      name: 'Facultad Politécnica y Transporte Universitario',
      type: 'FACULTAD',
    },
  });

  // --------------------------------------------------------------------------
  // 2. USUARIOS: 1 ADMIN, 5 INSPECTORES (1 POR ORGANIZACIÓN) Y 5 MECÁNICOS (SIN ORGANIZACIÓN)
  // --------------------------------------------------------------------------
  const admin = await prisma.user.upsert({
    where: { email: 'admin@uagrm.edu.bo' },
    update: { unitId: null, name: 'Administrador General Flota UAGRM', role: UserRole.ADMIN },
    create: {
      email: 'admin@uagrm.edu.bo',
      name: 'Administrador General Flota UAGRM',
      passwordHash,
      role: UserRole.ADMIN,
      unitId: null,
    },
  });

  // --- 5 INSPECTORES (cada uno asignado a su Unidad Organizacional) ---
  const inspAgricolas = await prisma.user.upsert({
    where: { email: 'inspector@uagrm.edu.bo' },
    update: {
      unitId: orgAgricolas.id,
      name: 'Carlos Inspector (Ciencias Agrícolas)',
      role: UserRole.INSPECTOR,
    },
    create: {
      email: 'inspector@uagrm.edu.bo',
      name: 'Carlos Inspector (Ciencias Agrícolas)',
      passwordHash,
      role: UserRole.INSPECTOR,
      unitId: orgAgricolas.id,
    },
  });

  const inspExactas = await prisma.user.upsert({
    where: { email: 'inspector.fcet@uagrm.edu.bo' },
    update: {
      unitId: orgExactas.id,
      name: 'Lucía Mendoza (Inspectora FCET)',
      role: UserRole.INSPECTOR,
    },
    create: {
      email: 'inspector.fcet@uagrm.edu.bo',
      name: 'Lucía Mendoza (Inspectora FCET)',
      passwordHash,
      role: UserRole.INSPECTOR,
      unitId: orgExactas.id,
    },
  });

  const inspVeterinaria = await prisma.user.upsert({
    where: { email: 'inspector.fmvz@uagrm.edu.bo' },
    update: {
      unitId: orgVeterinaria.id,
      name: 'Jorge Salvatierra (Inspector Veterinaria)',
      role: UserRole.INSPECTOR,
    },
    create: {
      email: 'inspector.fmvz@uagrm.edu.bo',
      name: 'Jorge Salvatierra (Inspector Veterinaria)',
      passwordHash,
      role: UserRole.INSPECTOR,
      unitId: orgVeterinaria.id,
    },
  });

  const inspComputacion = await prisma.user.upsert({
    where: { email: 'inspector.ficct@uagrm.edu.bo' },
    update: {
      unitId: orgComputacion.id,
      name: 'Valeria Suárez (Inspectora FICCT)',
      role: UserRole.INSPECTOR,
    },
    create: {
      email: 'inspector.ficct@uagrm.edu.bo',
      name: 'Valeria Suárez (Inspectora FICCT)',
      passwordHash,
      role: UserRole.INSPECTOR,
      unitId: orgComputacion.id,
    },
  });

  const inspPolitecnica = await prisma.user.upsert({
    where: { email: 'inspector.fp@uagrm.edu.bo' },
    update: {
      unitId: orgPolitecnica.id,
      name: 'Fernando Torrico (Inspector Politécnica)',
      role: UserRole.INSPECTOR,
    },
    create: {
      email: 'inspector.fp@uagrm.edu.bo',
      name: 'Fernando Torrico (Inspector Politécnica)',
      passwordHash,
      role: UserRole.INSPECTOR,
      unitId: orgPolitecnica.id,
    },
  });

  // Perfiles 1:1 de los 5 Inspectores
  const perfilesInspectores = [
    {
      userId: inspAgricolas.id,
      cred: 'INSP-FCA-001',
      zona: 'Facultad de Ciencias Agrícolas y El Vallecito',
      lic: 'C',
    },
    {
      userId: inspExactas.id,
      cred: 'INSP-FCET-002',
      zona: 'Facultad de Ciencias Exactas y Laboratorios',
      lic: 'B',
    },
    {
      userId: inspVeterinaria.id,
      cred: 'INSP-FMVZ-003',
      zona: 'Facultad de Veterinaria y Granja Experimental',
      lic: 'C',
    },
    {
      userId: inspComputacion.id,
      cred: 'INSP-FICCT-004',
      zona: 'Módulos FICCT y Redes Universitarias',
      lic: 'B',
    },
    {
      userId: inspPolitecnica.id,
      cred: 'INSP-FP-005',
      zona: 'Facultad Politécnica y Buses Universitarios',
      lic: 'C',
    },
  ];

  for (const p of perfilesInspectores) {
    await prisma.inspectorProfile.upsert({
      where: { userId: p.userId },
      update: {
        credentialNumber: p.cred,
        assignedZone: p.zona,
        licenseCategory: p.lic,
      },
      create: {
        userId: p.userId,
        credentialNumber: p.cred,
        assignedZone: p.zona,
        licenseCategory: p.lic,
        canAuthorizeRoute: true,
      },
    });
  }

  // --- 5 MECÁNICOS (Sin unidad organizacional: atienden órdenes de toda la universidad) ---
  const mec1 = await prisma.user.upsert({
    where: { email: 'mecanico@uagrm.edu.bo' },
    update: { unitId: null, name: 'Roberto Mecánico', role: UserRole.MECHANIC },
    create: {
      email: 'mecanico@uagrm.edu.bo',
      name: 'Roberto Mecánico',
      passwordHash,
      role: UserRole.MECHANIC,
      unitId: null,
    },
  });

  const mec2 = await prisma.user.upsert({
    where: { email: 'mecanico2@uagrm.edu.bo' },
    update: { unitId: null, name: 'Javier Vargas (Mecánico Diésel)', role: UserRole.MECHANIC },
    create: {
      email: 'mecanico2@uagrm.edu.bo',
      name: 'Javier Vargas (Mecánico Diésel)',
      passwordHash,
      role: UserRole.MECHANIC,
      unitId: null,
    },
  });

  const mec3 = await prisma.user.upsert({
    where: { email: 'mecanico3@uagrm.edu.bo' },
    update: { unitId: null, name: 'Miguel Ángel Rojas (Electricista)', role: UserRole.MECHANIC },
    create: {
      email: 'mecanico3@uagrm.edu.bo',
      name: 'Miguel Ángel Rojas (Electricista)',
      passwordHash,
      role: UserRole.MECHANIC,
      unitId: null,
    },
  });

  const mec4 = await prisma.user.upsert({
    where: { email: 'mecanico4@uagrm.edu.bo' },
    update: { unitId: null, name: 'Diego Peñaranda (Inyección OBD)', role: UserRole.MECHANIC },
    create: {
      email: 'mecanico4@uagrm.edu.bo',
      name: 'Diego Peñaranda (Inyección OBD)',
      passwordHash,
      role: UserRole.MECHANIC,
      unitId: null,
    },
  });

  const mec5 = await prisma.user.upsert({
    where: { email: 'mecanico5@uagrm.edu.bo' },
    update: { unitId: null, name: 'Hernán Justiniano (Tren Motriz)', role: UserRole.MECHANIC },
    create: {
      email: 'mecanico5@uagrm.edu.bo',
      name: 'Hernán Justiniano (Tren Motriz)',
      passwordHash,
      role: UserRole.MECHANIC,
      unitId: null,
    },
  });

  const perfilesMecanicos = [
    {
      userId: mec1.id,
      code: 'MEC-UAGRM-001',
      bay: 'Bahía 1 — Encendido e Inyección Electrónica',
      exp: 9,
      shift: 'MAÑANA',
    },
    {
      userId: mec2.id,
      code: 'MEC-UAGRM-002',
      bay: 'Bahía 2 — Motores Diésel Common-Rail',
      exp: 12,
      shift: 'COMPLETO',
    },
    {
      userId: mec3.id,
      code: 'MEC-UAGRM-003',
      bay: 'Bahía 3 — Sistemas Eléctricos y Red CAN',
      exp: 6,
      shift: 'MAÑANA',
    },
    {
      userId: mec4.id,
      code: 'MEC-UAGRM-004',
      bay: 'Bahía 4 — Sensores, Catalizadores y Emisiones',
      exp: 7,
      shift: 'TARDE',
    },
    {
      userId: mec5.id,
      code: 'MEC-UAGRM-005',
      bay: 'Bahía 5 — Refrigeración y Mantenimiento Preventivo',
      exp: 5,
      shift: 'TARDE',
    },
  ];

  for (const m of perfilesMecanicos) {
    await prisma.mechanicProfile.upsert({
      where: { userId: m.userId },
      update: {
        employeeCode: m.code,
        workshopBay: m.bay,
        experienceYears: m.exp,
        shift: m.shift,
      },
      create: {
        userId: m.userId,
        employeeCode: m.code,
        workshopBay: m.bay,
        experienceYears: m.exp,
        shift: m.shift,
      },
    });
  }

  // Catálogo de especialidades técnicas + Relación N:M (MechanicSpecialty)
  const espEncendido = await prisma.specialty.upsert({
    where: { code: 'IGN-OBD' },
    update: {},
    create: {
      code: 'IGN-OBD',
      name: 'Inyección Electrónica y Diagnóstico OBD-II',
      description: 'Interpretación de tramas CAN, sensores de oxígeno y encendido electrónico.',
    },
  });

  const espMotor = await prisma.specialty.upsert({
    where: { code: 'MOT-GAS' },
    update: {},
    create: {
      code: 'MOT-GAS',
      name: 'Motores a Gasolina y Diésel Common-Rail',
      description: 'Mantenimiento preventivo y correctivo de tren motriz y turbocompresores.',
    },
  });

  const espElec = await prisma.specialty.upsert({
    where: { code: 'ELEC-AUT' },
    update: {},
    create: {
      code: 'ELEC-AUT',
      name: 'Sistemas Eléctricos y Redes Multiplexadas CAN',
      description: 'Baterías, alternadores, cableado de ECU y módulos electrónicos.',
    },
  });

  const espEmisiones = await prisma.specialty.upsert({
    where: { code: 'EMIS-CAT' },
    update: {},
    create: {
      code: 'EMIS-CAT',
      name: 'Control de Emisiones, Catalizadores y EVAP',
      description: 'Diagnóstico de eficiencia catalítica, sondas lambda y fugas evaporativas.',
    },
  });

  for (const [mId, sId] of [
    [mec1.id, espEncendido.id],
    [mec1.id, espMotor.id],
    [mec2.id, espMotor.id],
    [mec3.id, espElec.id],
    [mec4.id, espEmisiones.id],
    [mec4.id, espEncendido.id],
    [mec5.id, espMotor.id],
  ] as const) {
    await prisma.mechanicSpecialty.upsert({
      where: { mechanicUserId_specialtyId: { mechanicUserId: mId, specialtyId: sId } },
      update: {},
      create: { mechanicUserId: mId, specialtyId: sId, level: 'SENIOR' },
    });
  }

  // --------------------------------------------------------------------------
  // 3. CLASIFICACIÓN JERÁRQUICA DE FLOTA (Categoría -> Marca -> Modelo -> 12 Vehículos)
  // --------------------------------------------------------------------------
  const catCamioneta = await prisma.vehicleCategory.upsert({
    where: { name: 'Camioneta 4x4 de Campo' },
    update: { inspectionCycleDays: 15 },
    create: {
      name: 'Camioneta 4x4 de Campo',
      description: 'Vehículos utilitarios para viajes de prácticas rurales y transporte de carga.',
      inspectionCycleDays: 15,
    },
  });

  const catMinibus = await prisma.vehicleCategory.upsert({
    where: { name: 'Transporte Estudiantil (Minibús)' },
    update: { inspectionCycleDays: 10 },
    create: {
      name: 'Transporte Estudiantil (Minibús)',
      description: 'Unidades de transporte de delegaciones estudiantiles y docentes.',
      inspectionCycleDays: 10,
    },
  });

  const catVagoneta = await prisma.vehicleCategory.upsert({
    where: { name: 'Vagoneta Institucional y Gestión' },
    update: { inspectionCycleDays: 30 },
    create: {
      name: 'Vagoneta Institucional y Gestión',
      description: 'Movilidades asignadas a facultades, direcciones y comisiones técnicas.',
      inspectionCycleDays: 30,
    },
  });

  const marcaToyota = await prisma.vehicleBrand.upsert({
    where: { name: 'Toyota' },
    update: {},
    create: { name: 'Toyota', countryOrigin: 'Japón' },
  });

  const marcaNissan = await prisma.vehicleBrand.upsert({
    where: { name: 'Nissan' },
    update: {},
    create: { name: 'Nissan', countryOrigin: 'Japón' },
  });

  const marcaMitsubishi = await prisma.vehicleBrand.upsert({
    where: { name: 'Mitsubishi' },
    update: {},
    create: { name: 'Mitsubishi', countryOrigin: 'Japón' },
  });

  const marcaSuzuki = await prisma.vehicleBrand.upsert({
    where: { name: 'Suzuki' },
    update: {},
    create: { name: 'Suzuki', countryOrigin: 'Japón' },
  });

  const modTacoma = await prisma.vehicleModel.upsert({
    where: { brandId_name: { brandId: marcaToyota.id, name: 'Tacoma' } },
    update: { categoryId: catCamioneta.id },
    create: {
      brandId: marcaToyota.id,
      categoryId: catCamioneta.id,
      name: 'Tacoma',
      engineType: 'GASOLINA',
      displacement: '3.5L V6',
    },
  });

  const modHilux = await prisma.vehicleModel.upsert({
    where: { brandId_name: { brandId: marcaToyota.id, name: 'Hilux' } },
    update: { categoryId: catCamioneta.id },
    create: {
      brandId: marcaToyota.id,
      categoryId: catCamioneta.id,
      name: 'Hilux',
      engineType: 'GASOLINA',
      displacement: '2.7L VVT-i',
    },
  });

  const modHiace = await prisma.vehicleModel.upsert({
    where: { brandId_name: { brandId: marcaToyota.id, name: 'Hiace' } },
    update: { categoryId: catMinibus.id },
    create: {
      brandId: marcaToyota.id,
      categoryId: catMinibus.id,
      name: 'Hiace',
      engineType: 'GASOLINA',
      displacement: '2.7L',
    },
  });

  const modLandCruiser = await prisma.vehicleModel.upsert({
    where: { brandId_name: { brandId: marcaToyota.id, name: 'Land Cruiser Prado' } },
    update: { categoryId: catVagoneta.id },
    create: {
      brandId: marcaToyota.id,
      categoryId: catVagoneta.id,
      name: 'Land Cruiser Prado',
      engineType: 'GASOLINA',
      displacement: '4.0L V6',
    },
  });

  const modFrontier = await prisma.vehicleModel.upsert({
    where: { brandId_name: { brandId: marcaNissan.id, name: 'Frontier NP300' } },
    update: { categoryId: catCamioneta.id },
    create: {
      brandId: marcaNissan.id,
      categoryId: catCamioneta.id,
      name: 'Frontier NP300',
      engineType: 'GASOLINA',
      displacement: '2.5L',
    },
  });

  const modUrvan = await prisma.vehicleModel.upsert({
    where: { brandId_name: { brandId: marcaNissan.id, name: 'NV350 Urvan' } },
    update: { categoryId: catMinibus.id },
    create: {
      brandId: marcaNissan.id,
      categoryId: catMinibus.id,
      name: 'NV350 Urvan',
      engineType: 'GASOLINA',
      displacement: '2.5L QR25',
    },
  });

  const modL200 = await prisma.vehicleModel.upsert({
    where: { brandId_name: { brandId: marcaMitsubishi.id, name: 'L200 Triton' } },
    update: { categoryId: catCamioneta.id },
    create: {
      brandId: marcaMitsubishi.id,
      categoryId: catCamioneta.id,
      name: 'L200 Triton',
      engineType: 'DIESEL',
      displacement: '2.4L DID',
    },
  });

  const modVitara = await prisma.vehicleModel.upsert({
    where: { brandId_name: { brandId: marcaSuzuki.id, name: 'Grand Vitara' } },
    update: { categoryId: catVagoneta.id },
    create: {
      brandId: marcaSuzuki.id,
      categoryId: catVagoneta.id,
      name: 'Grand Vitara',
      engineType: 'GASOLINA',
      displacement: '2.4L',
    },
  });

  // --------------------------------------------------------------------------
  // 12 VEHÍCULOS REPARTIDOS EN LAS 5 ORGANIZACIONES (CON SU INSPECTOR RESPECTIVO)
  // --------------------------------------------------------------------------

  // Organización 1: Facultad de Ciencias Agrícolas (FCA-UAGRM) -> Carlos Inspector (3 vehículos)
  const tacoma = await prisma.vehicle.upsert({
    where: { plate: '5521-TAC' },
    update: {
      status: VehicleStatus.CRITICAL,
      modelId: modTacoma.id,
      categoryId: catCamioneta.id,
      unitId: orgAgricolas.id,
      responsibleId: inspAgricolas.id,
    },
    create: {
      vin: 'TESTTAC0000000001',
      plate: '5521-TAC',
      alias: 'Camioneta Prácticas Agrícolas Okinawa',
      make: 'Toyota',
      model: 'Tacoma',
      year: 2021,
      status: VehicleStatus.CRITICAL,
      responsibleId: inspAgricolas.id,
      modelId: modTacoma.id,
      categoryId: catCamioneta.id,
      unitId: orgAgricolas.id,
    },
  });

  const l200 = await prisma.vehicle.upsert({
    where: { plate: '5190-MIT' },
    update: {
      status: VehicleStatus.ALERT,
      modelId: modL200.id,
      categoryId: catCamioneta.id,
      unitId: orgAgricolas.id,
      responsibleId: inspAgricolas.id,
    },
    create: {
      vin: 'MMBJNKB40FD051920',
      plate: '5190-MIT',
      alias: 'Camioneta Estación Experimental El Vallecito',
      make: 'Mitsubishi',
      model: 'L200 Triton',
      year: 2020,
      status: VehicleStatus.ALERT,
      responsibleId: inspAgricolas.id,
      modelId: modL200.id,
      categoryId: catCamioneta.id,
      unitId: orgAgricolas.id,
    },
  });

  const hiluxAgr = await prisma.vehicle.upsert({
    where: { plate: '2940-FCA' },
    update: {
      status: VehicleStatus.OK,
      modelId: modHilux.id,
      categoryId: catCamioneta.id,
      unitId: orgAgricolas.id,
      responsibleId: inspAgricolas.id,
    },
    create: {
      vin: '8AJBA3CD901552940',
      plate: '2940-FCA',
      alias: 'Camioneta Extensión Forestal FCA',
      make: 'Toyota',
      model: 'Hilux',
      year: 2018,
      status: VehicleStatus.OK,
      responsibleId: inspAgricolas.id,
      modelId: modHilux.id,
      categoryId: catCamioneta.id,
      unitId: orgAgricolas.id,
    },
  });

  // Organización 2: Facultad de Ciencias Exactas y Tecnología (FCET-UAGRM) -> Lucía Mendoza (3 vehículos)
  const frontier = await prisma.vehicle.upsert({
    where: { plate: '4829-NFP' },
    update: {
      status: VehicleStatus.CRITICAL,
      modelId: modFrontier.id,
      categoryId: catCamioneta.id,
      unitId: orgExactas.id,
      responsibleId: inspExactas.id,
    },
    create: {
      vin: '3N6AD33A6ZK884120',
      plate: '4829-NFP',
      alias: 'Camioneta Topografía e Ingeniería Civil (FCET)',
      make: 'Nissan',
      model: 'Frontier NP300',
      year: 2022,
      status: VehicleStatus.CRITICAL,
      responsibleId: inspExactas.id,
      modelId: modFrontier.id,
      categoryId: catCamioneta.id,
      unitId: orgExactas.id,
    },
  });

  const prado = await prisma.vehicle.upsert({
    where: { plate: '3895-CET' },
    update: {
      status: VehicleStatus.OK,
      modelId: modLandCruiser.id,
      categoryId: catVagoneta.id,
      unitId: orgExactas.id,
      responsibleId: inspExactas.id,
    },
    create: {
      vin: 'JTEBU5JR5K5712389',
      plate: '3895-CET',
      alias: 'Vagoneta Decanato Ciencias Exactas',
      make: 'Toyota',
      model: 'Land Cruiser Prado',
      year: 2021,
      status: VehicleStatus.OK,
      responsibleId: inspExactas.id,
      modelId: modLandCruiser.id,
      categoryId: catVagoneta.id,
      unitId: orgExactas.id,
    },
  });

  const vitaraCet = await prisma.vehicle.upsert({
    where: { plate: '4105-SZK' },
    update: {
      status: VehicleStatus.OK,
      modelId: modVitara.id,
      categoryId: catVagoneta.id,
      unitId: orgExactas.id,
      responsibleId: inspExactas.id,
    },
    create: {
      vin: 'JS3TD04V1B4105992',
      plate: '4105-SZK',
      alias: 'Vagoneta Laboratorio de Petróleo y Gas',
      make: 'Suzuki',
      model: 'Grand Vitara',
      year: 2020,
      status: VehicleStatus.OK,
      responsibleId: inspExactas.id,
      modelId: modVitara.id,
      categoryId: catVagoneta.id,
      unitId: orgExactas.id,
    },
  });

  // Organización 3: Facultad de Medicina Veterinaria y Zootecnia (FMVZ-UAGRM) -> Jorge Salvatierra (2 vehículos)
  const hilux = await prisma.vehicle.upsert({
    where: { plate: '4012-UAG' },
    update: {
      status: VehicleStatus.OK,
      modelId: modHilux.id,
      categoryId: catCamioneta.id,
      unitId: orgVeterinaria.id,
      responsibleId: inspVeterinaria.id,
    },
    create: {
      vin: '8AJBA3CD201928374',
      plate: '4012-UAG',
      alias: 'Camioneta Clínica y Sanidad Animal FMVZ',
      make: 'Toyota',
      model: 'Hilux',
      year: 2019,
      status: VehicleStatus.OK,
      responsibleId: inspVeterinaria.id,
      modelId: modHilux.id,
      categoryId: catCamioneta.id,
      unitId: orgVeterinaria.id,
    },
  });

  const frontierVet = await prisma.vehicle.upsert({
    where: { plate: '4618-VET' },
    update: {
      status: VehicleStatus.ALERT,
      modelId: modFrontier.id,
      categoryId: catCamioneta.id,
      unitId: orgVeterinaria.id,
      responsibleId: inspVeterinaria.id,
    },
    create: {
      vin: '3N6AD33A9ZK461877',
      plate: '4618-VET',
      alias: 'Camioneta Granja Experimental Yabaré',
      make: 'Nissan',
      model: 'Frontier NP300',
      year: 2021,
      status: VehicleStatus.ALERT,
      responsibleId: inspVeterinaria.id,
      modelId: modFrontier.id,
      categoryId: catCamioneta.id,
      unitId: orgVeterinaria.id,
    },
  });

  // Organización 4: Facultad de Ciencias de la Computación (FICCT-UAGRM) -> Valeria Suárez (2 vehículos)
  const urvan = await prisma.vehicle.upsert({
    where: { plate: '4471-BUS' },
    update: {
      status: VehicleStatus.OK,
      modelId: modUrvan.id,
      categoryId: catMinibus.id,
      unitId: orgComputacion.id,
      responsibleId: inspComputacion.id,
    },
    create: {
      vin: 'JN1TC2E26Z0044712',
      plate: '4471-BUS',
      alias: 'Minibús Delegaciones Académicas FICCT',
      make: 'Nissan',
      model: 'NV350 Urvan',
      year: 2022,
      status: VehicleStatus.OK,
      responsibleId: inspComputacion.id,
      modelId: modUrvan.id,
      categoryId: catMinibus.id,
      unitId: orgComputacion.id,
    },
  });

  const vitaraFicct = await prisma.vehicle.upsert({
    where: { plate: '5033-ICC' },
    update: {
      status: VehicleStatus.CRITICAL,
      modelId: modVitara.id,
      categoryId: catVagoneta.id,
      unitId: orgComputacion.id,
      responsibleId: inspComputacion.id,
    },
    create: {
      vin: 'JS3TD04V8C5033118',
      plate: '5033-ICC',
      alias: 'Vagoneta Soporte de Redes y Fibra Óptica',
      make: 'Suzuki',
      model: 'Grand Vitara',
      year: 2021,
      status: VehicleStatus.CRITICAL,
      responsibleId: inspComputacion.id,
      modelId: modVitara.id,
      categoryId: catVagoneta.id,
      unitId: orgComputacion.id,
    },
  });

  // Organización 5: Facultad Politécnica y Transporte (FP-UAGRM) -> Fernando Torrico (2 vehículos)
  const coaster = await prisma.vehicle.upsert({
    where: { plate: '3110-BUS' },
    update: {
      status: VehicleStatus.ALERT,
      modelId: modHiace.id,
      categoryId: catMinibus.id,
      unitId: orgPolitecnica.id,
      responsibleId: inspPolitecnica.id,
    },
    create: {
      vin: 'JTGFB518701122334',
      plate: '3110-BUS',
      alias: 'Minibús Transporte Estudiantil #3',
      make: 'Toyota',
      model: 'Hiace',
      year: 2020,
      status: VehicleStatus.ALERT,
      responsibleId: inspPolitecnica.id,
      modelId: modHiace.id,
      categoryId: catMinibus.id,
      unitId: orgPolitecnica.id,
    },
  });

  const l200Poli = await prisma.vehicle.upsert({
    where: { plate: '3722-POL' },
    update: {
      status: VehicleStatus.OK,
      modelId: modL200.id,
      categoryId: catCamioneta.id,
      unitId: orgPolitecnica.id,
      responsibleId: inspPolitecnica.id,
    },
    create: {
      vin: 'MMBJNKB40FD037229',
      plate: '3722-POL',
      alias: 'Camioneta Mecánica Automotriz Politécnica',
      make: 'Mitsubishi',
      model: 'L200 Triton',
      year: 2019,
      status: VehicleStatus.OK,
      responsibleId: inspPolitecnica.id,
      modelId: modL200.id,
      categoryId: catCamioneta.id,
      unitId: orgPolitecnica.id,
    },
  });

  // --------------------------------------------------------------------------
  // 4. CATÁLOGO TÉCNICO OBD-II (obd_systems + dtc_catalog)
  // --------------------------------------------------------------------------
  const sysPowertrain = await prisma.obdSystem.upsert({
    where: { prefix: 'P' },
    update: {},
    create: {
      prefix: 'P',
      name: 'Powertrain (Motor y Transmisión)',
      description: 'Códigos SAE J2012 de encendido, inyección, emisiones y tren motriz.',
    },
  });

  await prisma.obdSystem.upsert({
    where: { prefix: 'C' },
    update: {},
    create: {
      prefix: 'C',
      name: 'Chassis (Frenos, ABS y Suspensión)',
      description: 'Sistemas de control de estabilidad, dirección y frenado.',
    },
  });

  await prisma.obdSystem.upsert({
    where: { prefix: 'B' },
    update: {},
    create: {
      prefix: 'B',
      name: 'Body (Carrocería y Seguridad Pasiva)',
      description: 'Airbags, climatización, inmovilizador e instrumentación.',
    },
  });

  await prisma.obdSystem.upsert({
    where: { prefix: 'U' },
    update: {},
    create: {
      prefix: 'U',
      name: 'Network (Red de Comunicación CAN)',
      description: 'Pérdida de comunicación o tramas inválidas entre módulos ECU.',
    },
  });

  for (const [code, description] of Object.entries(STATIC_OBD_DICTIONARY)) {
    const isCritical = ['P0300', 'P0301', 'P0302', 'P0335', 'P0115'].includes(code);
    await prisma.dtcCatalog.upsert({
      where: { code },
      update: { description },
      create: {
        code,
        systemId: sysPowertrain.id,
        description,
        defaultSeverity: isCritical ? ScanSeverity.HIGH : ScanSeverity.MEDIUM,
        commonCauses: code.startsWith('P030')
          ? 'Bobina de encendido deteriorada, bujía desgastada, inyector obstruido o pérdida de compresión.'
          : 'Sensor descalibrado, conector sulfatado o fuga de vacío en admisión.',
        isEmissionsRelated: true,
      },
    });
  }

  // --------------------------------------------------------------------------
  // 5. INVENTARIO DE REPUESTOS E INSUMOS (spare_part_categories + spare_parts)
  // --------------------------------------------------------------------------
  const catRepEncendido = await prisma.sparePartCategory.upsert({
    where: { name: 'Sistema de Encendido' },
    update: {},
    create: {
      name: 'Sistema de Encendido',
      description: 'Bobinas, bujías de iridio, cables de alta tensión y módulos.',
    },
  });

  const catRepSensores = await prisma.sparePartCategory.upsert({
    where: { name: 'Sensores y Electrónica OBD' },
    update: {},
    create: {
      name: 'Sensores y Electrónica OBD',
      description: 'Sensores de oxígeno (A/F), ECT, CKP, MAF y válvulas EVAP.',
    },
  });

  const catRepFiltros = await prisma.sparePartCategory.upsert({
    where: { name: 'Filtros y Mantenimiento Preventivo' },
    update: {},
    create: {
      name: 'Filtros y Mantenimiento Preventivo',
      description: 'Filtros de aire, combustible, aceite y empaquetaduras.',
    },
  });

  const catRepRefrigeracion = await prisma.sparePartCategory.upsert({
    where: { name: 'Refrigeración y Emisiones' },
    update: {},
    create: {
      name: 'Refrigeración y Emisiones',
      description: 'Termostatos, refrigerante, juntas de escape y catalizadores.',
    },
  });

  const repBobina = await prisma.sparePart.upsert({
    where: { sku: 'TOY-IGN-90919' },
    update: { stock: 6, minStock: 2 },
    create: {
      categoryId: catRepEncendido.id,
      sku: 'TOY-IGN-90919',
      name: 'Bobina de encendido directa Denso Toyota V6',
      brand: 'Denso OEM',
      unitCost: 480,
      stock: 6,
      minStock: 2,
    },
  });

  const repBujia = await prisma.sparePart.upsert({
    where: { sku: 'NGK-IR-6619' },
    update: { stock: 18, minStock: 6 },
    create: {
      categoryId: catRepEncendido.id,
      sku: 'NGK-IR-6619',
      name: 'Bujía de Iridio LFR6AIX-11',
      brand: 'NGK',
      unitCost: 85,
      stock: 18,
      minStock: 6,
    },
  });

  const repSensorO2 = await prisma.sparePart.upsert({
    where: { sku: 'DEN-O2-23490' },
    update: { stock: 3, minStock: 2 },
    create: {
      categoryId: catRepSensores.id,
      sku: 'DEN-O2-23490',
      name: 'Sensor de Relación Aire/Combustible (A/F Banco 1 Sensor 1)',
      brand: 'Denso',
      unitCost: 920,
      stock: 3,
      minStock: 2,
    },
  });

  await prisma.sparePart.upsert({
    where: { sku: 'NIS-ECT-22630' },
    update: { stock: 1, minStock: 2 },
    create: {
      categoryId: catRepSensores.id,
      sku: 'NIS-ECT-22630',
      name: 'Sensor de Temperatura de Refrigerante (ECT) 2 Pines',
      brand: 'Hitachi / Nissan',
      unitCost: 210,
      stock: 1,
      minStock: 2,
    },
  });

  const repSensorMaf = await prisma.sparePart.upsert({
    where: { sku: 'MIT-MAF-1525A' },
    update: { stock: 2, minStock: 2 },
    create: {
      categoryId: catRepSensores.id,
      sku: 'MIT-MAF-1525A',
      name: 'Sensor de Flujo de Masa de Aire (MAF) Digital',
      brand: 'Mitsubishi Electric',
      unitCost: 650,
      stock: 2,
      minStock: 2,
    },
  });

  const repFiltroAire = await prisma.sparePart.upsert({
    where: { sku: 'TOY-FIL-17801' },
    update: { stock: 11, minStock: 4 },
    create: {
      categoryId: catRepFiltros.id,
      sku: 'TOY-FIL-17801',
      name: 'Filtro de aire primario de admisión',
      brand: 'Toyota Genuine',
      unitCost: 140,
      stock: 11,
      minStock: 4,
    },
  });

  const repTermostato = await prisma.sparePart.upsert({
    where: { sku: 'TOY-THM-90916' },
    update: { stock: 5, minStock: 2 },
    create: {
      categoryId: catRepRefrigeracion.id,
      sku: 'TOY-THM-90916',
      name: 'Termostato de refrigeración 82°C con sello',
      brand: 'Toyota Genuine',
      unitCost: 195,
      stock: 5,
      minStock: 2,
    },
  });

  const repLimpiador = await prisma.sparePart.upsert({
    where: { sku: 'CRC-MAF-05110' },
    update: { stock: 9, minStock: 3 },
    create: {
      categoryId: catRepFiltros.id,
      sku: 'CRC-MAF-05110',
      name: 'Limpiador dieléctrico de sensores MAF y cuerpo de aceleración',
      brand: 'CRC Industries',
      unitCost: 75,
      stock: 9,
      minStock: 3,
    },
  });

  const repValvulaEvap = await prisma.sparePart.upsert({
    where: { sku: 'SZK-EVP-18117' },
    update: { stock: 1, minStock: 2 },
    create: {
      categoryId: catRepSensores.id,
      sku: 'SZK-EVP-18117',
      name: 'Válvula solenoide de purga de canister EVAP',
      brand: 'Suzuki Genuine',
      unitCost: 310,
      stock: 1,
      minStock: 2,
    },
  });

  // Limpiar registros transaccionales previos
  await prisma.notificationLog.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.workOrderStatusHistory.deleteMany({});
  await prisma.workOrderPart.deleteMany({});
  await prisma.workOrderTask.deleteMany({});
  await prisma.workOrder.deleteMany({});
  await prisma.diagnosis.deleteMany({});
  await prisma.dtcEntry.deleteMany({});
  await prisma.scan.deleteMany({});

  const protocoloCan = {
    number: '6',
    automatic: true,
    isCan: true,
    label: 'ISO 15765-4 CAN (11 bit, 500 kbaud)',
    raw: 'A6',
  };

  // ==========================================================================
  // ORG 1 (FCA): TOYOTA TACOMA (5521-TAC) -> 3 ESCANEOS + ORDEN EN PROCESO (Mecánico 1: Roberto)
  // ==========================================================================
  await prisma.scan.create({
    data: {
      vehicleId: tacoma.id,
      scannedById: inspAgricolas.id,
      batteryVoltage: 13.8,
      scannedAt: haceDias(25),
      severity: ScanSeverity.NONE,
      aiProcessed: false,
      notes: 'Control preventivo mensual antes de inicio de semestre.',
      rationale: 'Sin códigos de falla activos ni pendientes. Monitores completos.',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: false,
        dtcCount: 0,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 00 07 65 00',
      },
    },
  });

  const scanTacomaPrevio = await prisma.scan.create({
    data: {
      vehicleId: tacoma.id,
      scannedById: inspAgricolas.id,
      batteryVoltage: 13.4,
      scannedAt: haceDias(10),
      severity: ScanSeverity.MEDIUM,
      aiProcessed: true,
      notes: 'El conductor reportó ligero tironeo en subida durante comisión rural.',
      rationale:
        'Se detecta 1 código confirmado (P0300) y 1 código pendiente de mezcla pobre (P0171) con monitores completos.',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: true,
        dtcCount: 1,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 81 07 65 00',
      },
      dtcEntries: {
        create: [
          { code: 'P0300', type: DtcType.CONFIRMED, catalogCode: 'P0300' },
          { code: 'P0171', type: DtcType.PENDING, catalogCode: 'P0171' },
        ],
      },
    },
  });

  await prisma.diagnosis.create({
    data: {
      scanId: scanTacomaPrevio.id,
      provider: 'claude',
      prompt: 'Analizar P0300 CONFIRMED y P0171 PENDING en Toyota Tacoma 2021',
      response: 'Hipótesis inicial de fallo de encendido asociado a posible entrada de aire.',
      summary:
        'Se observa fallo de encendido aleatorio (P0300) acompañado de tendencia a mezcla pobre en Banco 1 (P0171). Se sugiere verificar fugas de vacío en admisión y presión de riel de combustible.',
      severity: 'MEDIUM',
      recommendations: {
        probableCauses: [
          {
            cause: 'Fuga menor de vacío en manguera de admisión o junta de múltiple',
            confidence: 'ALTA',
          },
          {
            cause: 'Suciedad en filamento del sensor MAF o filtro de aire saturado',
            confidence: 'MEDIA',
          },
        ],
        verificationSteps: [
          'Inspeccionar mangueras de vacío y abrazaderas del conducto de admisión',
          'Limpiar sensor MAF y revisar estado del filtro de aire',
        ],
        correlations:
          'Una entrada de aire no medida después del MAF empobrece la mezcla (P0171) y provoca fallos de combustión intermitentes (P0300).',
      },
      tokensUsed: 385,
      latencyMs: 1180,
    },
  });

  const scanTacomaActual = await prisma.scan.create({
    data: {
      vehicleId: tacoma.id,
      scannedById: inspAgricolas.id,
      batteryVoltage: 13.3,
      scannedAt: haceDias(1),
      severity: ScanSeverity.CRITICAL,
      aiProcessed: true,
      notes: 'Inspección previa a viaje de prácticas a Okinawa. Vibración marcada en ralentí.',
      rationale:
        'Se detectan 2 códigos confirmados (P0300, P0301) respaldados por códigos permanentes y recurrencia histórica de P0300. Requiere evaluación técnica prioritaria.',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: true,
        dtcCount: 2,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 82 07 65 00',
      },
      dtcEntries: {
        create: [
          { code: 'P0300', type: DtcType.CONFIRMED, catalogCode: 'P0300' },
          { code: 'P0301', type: DtcType.CONFIRMED, catalogCode: 'P0301' },
          { code: 'P0301', type: DtcType.PERMANENT, catalogCode: 'P0301' },
        ],
      },
    },
  });

  const pasosVerificacionTacoma = [
    'Inspeccionar visualmente bobina, conector y cableado del cilindro 1',
    'Intercambiar la bobina del cilindro 1 con el cilindro 2 y verificar si el fallo se traslada',
    'Retirar y examinar la bujía del cilindro 1 comparándola con las demás',
    'Medir la resistencia y pulso del inyector del cilindro 1',
  ];

  const diagnosisTacoma = await prisma.diagnosis.create({
    data: {
      scanId: scanTacomaActual.id,
      provider: 'claude',
      prompt:
        'Analizar DTCs P0300 (CONFIRMED, recurrente), P0301 (CONFIRMED/PERMANENT) con monitores completos para Toyota Tacoma 2021',
      response:
        'Hipótesis técnica: fallo de encendido activo y recurrente focalizado en cilindro 1.',
      summary:
        'El fallo de encendido aleatorio (P0300) del escaneo anterior evolucionó y se focalizó como falla confirmada y permanente en el cilindro 1 (P0301). El código de mezcla pobre P0171 desapareció tras el ajuste de admisión, confirmando que el problema actual es eléctrico o de ignición en el cilindro 1.',
      severity: 'CRITICAL',
      recommendations: {
        probableCauses: [
          {
            cause: 'Bobina de encendido directa (COP) del cilindro 1 con aislamiento perforado',
            confidence: 'ALTA',
          },
          {
            cause: 'Bujía del cilindro 1 con electrodo desgastado o fisura cerámica',
            confidence: 'MEDIA',
          },
          {
            cause: 'Inyector del cilindro 1 con obstrucción parcial',
            confidence: 'BAJA',
          },
        ],
        verificationSteps: pasosVerificacionTacoma,
        correlations:
          'P0300 es desencadenado directamente por la severidad del fallo continuo en el cilindro 1 (P0301). Resolver P0301 eliminará ambos códigos.',
      },
      tokensUsed: 445,
      latencyMs: 1420,
    },
  });

  const ordenTacoma = await prisma.workOrder.create({
    data: {
      scanId: scanTacomaActual.id,
      diagnosisId: diagnosisTacoma.id,
      vehicleId: tacoma.id,
      assignedToId: mec1.id,
      status: WorkOrderStatus.IN_PROGRESS,
      priority: WorkOrderPriority.CRITICAL,
      description:
        'Evaluación mecánica prioritaria de sistema de encendido cilindro 1 (P0300 / P0301)',
      notes:
        '[2026-11-21] Orden generada automáticamente tras detectar recurrencia en P0300 y aparición de P0301.\n' +
        '[2026-11-22] Roberto Mecánico: Se aisló fallo en bobina del cilindro 1; al intercambiar con cilindro 2 el fallo se trasladó. Se procede al reemplazo de bobina y bujía.',
      n8nNotified: true,
      createdAt: haceDias(1),
    },
  });

  await prisma.workOrderTask.createMany({
    data: pasosVerificacionTacoma.map((desc, idx) => ({
      workOrderId: ordenTacoma.id,
      description: desc,
      completed: idx < 3,
      completedAt: idx < 3 ? haceDias(0, 3) : null,
    })),
  });

  await prisma.workOrderPart.createMany({
    data: [
      {
        workOrderId: ordenTacoma.id,
        sparePartId: repBobina.id,
        quantity: 1,
        unitCost: repBobina.unitCost,
        notes: 'Reemplazo de bobina defectuosa en cilindro 1.',
      },
      {
        workOrderId: ordenTacoma.id,
        sparePartId: repBujia.id,
        quantity: 1,
        unitCost: repBujia.unitCost,
        notes: 'Bujía de iridio cilindro 1.',
      },
    ],
  });

  await prisma.workOrderStatusHistory.createMany({
    data: [
      {
        workOrderId: ordenTacoma.id,
        fromStatus: null,
        toStatus: WorkOrderStatus.OPEN,
        changedById: inspAgricolas.id,
        reason: 'Apertura automática por detección de DTC confirmado y recurrente P0300 / P0301.',
        changedAt: haceDias(1),
      },
      {
        workOrderId: ordenTacoma.id,
        fromStatus: WorkOrderStatus.OPEN,
        toStatus: WorkOrderStatus.IN_PROGRESS,
        changedById: mec1.id,
        reason: 'Roberto Mecánico inició diagnóstico en Bahía 1.',
        changedAt: haceDias(0, 5),
      },
    ],
  });

  // ==========================================================================
  // ORG 1 (FCA): MITSUBISHI L200 (5190-MIT) -> ORDEN EN PROCESO (Mecánico 3: Miguel Ángel)
  // ==========================================================================
  const scanL200 = await prisma.scan.create({
    data: {
      vehicleId: l200.id,
      scannedById: inspAgricolas.id,
      batteryVoltage: 13.5,
      scannedAt: haceDias(3),
      severity: ScanSeverity.MEDIUM,
      aiProcessed: true,
      notes: 'Pérdida leve de potencia en carretera hacia El Vallecito.',
      rationale: 'Código confirmado P0102 (entrada baja en circuito de flujo de masa de aire MAF).',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: true,
        dtcCount: 1,
        monitorsCompleted: true,
        incompleteMonitors: [],
        compressionIgnition: true,
        rawHex: '41 01 81 0F 65 00',
      },
      dtcEntries: {
        create: [{ code: 'P0102', type: DtcType.CONFIRMED, catalogCode: 'P0102' }],
      },
    },
  });

  const diagL200 = await prisma.diagnosis.create({
    data: {
      scanId: scanL200.id,
      provider: 'claude',
      prompt: 'Analizar P0102 CONFIRMED en Mitsubishi L200 Diésel 2020',
      response: 'Señal de voltaje bajo en sensor MAF de motor diésel.',
      summary:
        'La ECU detecta una tensión inferior al mínimo esperado en el sensor MAF (P0102), lo que limita la inyección de combustible para evitar humo negro y reduce la potencia.',
      severity: 'MEDIUM',
      recommendations: {
        probableCauses: [
          {
            cause: 'Sensor MAF con acumulación de hollín o conector flojo en caja de filtro',
            confidence: 'ALTA',
          },
          {
            cause: 'Interrupción en línea de alimentación de 5V de referencia al sensor MAF',
            confidence: 'MEDIA',
          },
        ],
        verificationSteps: [
          'Limpiar sensor MAF con aerosol dieléctrico y verificar traba del conector',
          'Comprobar tensión de alimentación de 12V y 5V de referencia en el arnés del MAF',
        ],
        correlations: null,
      },
      tokensUsed: 340,
      latencyMs: 1090,
    },
  });

  const ordenL200 = await prisma.workOrder.create({
    data: {
      scanId: scanL200.id,
      diagnosisId: diagL200.id,
      vehicleId: l200.id,
      assignedToId: mec3.id,
      status: WorkOrderStatus.IN_PROGRESS,
      priority: WorkOrderPriority.MEDIUM,
      description: 'Diagnóstico y reemplazo de sensor de flujo de aire MAF (P0102)',
      notes:
        '[2026-11-19] Miguel Ángel Rojas (Electricista): Se verificó arnés con multímetro (voltajes OK). El sensor MAF presenta lectura fija; se asignó repuesto de almacén.',
      n8nNotified: true,
      createdAt: haceDias(3),
    },
  });

  await prisma.workOrderTask.createMany({
    data: [
      {
        workOrderId: ordenL200.id,
        description: 'Comprobar tensión de alimentación de 12V y 5V de referencia en el arnés del MAF',
        completed: true,
        completedAt: haceDias(2),
      },
      {
        workOrderId: ordenL200.id,
        description: 'Reemplazar sensor MAF y realizar prueba de ruta con lectura de gramos/seg',
        completed: false,
      },
    ],
  });

  await prisma.workOrderPart.create({
    data: {
      workOrderId: ordenL200.id,
      sparePartId: repSensorMaf.id,
      quantity: 1,
      unitCost: repSensorMaf.unitCost,
      notes: 'Sensor MAF digital asignado a la unidad 5190-MIT.',
    },
  });

  // ORG 1 (FCA): HILUX FORESTAL (2940-FCA) -> Escaneo atrasado (36 días)
  await prisma.scan.create({
    data: {
      vehicleId: hiluxAgr.id,
      scannedById: inspAgricolas.id,
      batteryVoltage: 13.7,
      scannedAt: haceDias(36),
      severity: ScanSeverity.NONE,
      aiProcessed: false,
      notes: 'Último control registrado antes de salida a campo.',
      rationale: 'Sin códigos de falla en el momento de la lectura.',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: false,
        dtcCount: 0,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 00 07 65 00',
      },
    },
  });

  // ==========================================================================
  // ORG 2 (FCET): NISSAN FRONTIER (4829-NFP) -> 2 ESCANEOS + ORDEN ABIERTA SIN ASIGNAR
  // (Disponible para que cualquier mecánico la tome o el Admin la asigne)
  // ==========================================================================
  await prisma.scan.create({
    data: {
      vehicleId: frontier.id,
      scannedById: inspExactas.id,
      batteryVoltage: 13.7,
      scannedAt: haceDias(18),
      severity: ScanSeverity.LOW,
      aiProcessed: false,
      notes: 'Revisión tras retorno de comisión de topografía.',
      rationale: 'Código pendiente aislado P0115 (circuito de temperatura de refrigerante).',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: false,
        dtcCount: 0,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 00 07 65 00',
      },
      dtcEntries: {
        create: [{ code: 'P0115', type: DtcType.PENDING, catalogCode: 'P0115' }],
      },
    },
  });

  const scanFrontierActual = await prisma.scan.create({
    data: {
      vehicleId: frontier.id,
      scannedById: inspExactas.id,
      batteryVoltage: 12.1,
      scannedAt: haceDias(0, 6),
      severity: ScanSeverity.HIGH,
      aiProcessed: true,
      notes:
        'Electroventilador permanece encendido de forma continua y arranque en frío dificultoso.',
      rationale:
        'Código confirmado P0115 (recurrente respecto al escaneo anterior) junto con voltaje bajo de sistema P0562 (12.1 V). Requiere revisión eléctrica.',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: true,
        dtcCount: 2,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 82 07 65 00',
      },
      dtcEntries: {
        create: [
          { code: 'P0115', type: DtcType.CONFIRMED, catalogCode: 'P0115' },
          { code: 'P0562', type: DtcType.CONFIRMED, catalogCode: 'P0562' },
        ],
      },
    },
  });

  const pasosFrontier = [
    'Verificar voltaje de carga del alternador en ralentí y a 2.500 RPM (13.8 V a 14.4 V)',
    'Inspeccionar arnés y conector de 2 pines del sensor ECT en culata por sulfatación',
    'Medir resistencia NTC del sensor de temperatura ECT en frío y caliente',
  ];

  const diagnosisFrontier = await prisma.diagnosis.create({
    data: {
      scanId: scanFrontierActual.id,
      provider: 'claude',
      prompt: 'Analizar P0115 CONFIRMED (recurrente) y P0562 CONFIRMED (12.1V) en Nissan Frontier',
      response: 'Falla combinada de circuito de sensor ECT y caída de tensión en sistema de carga.',
      summary:
        'El código P0115 pasó de pendiente a confirmado, activando el electroventilador en modo de protección de emergencia. La lectura de 12.1 V con código P0562 indica que la batería está operando por debajo del umbral nominal debido al consumo continuo del ventilador.',
      severity: 'HIGH',
      recommendations: {
        probableCauses: [
          {
            cause: 'Sensor de temperatura de refrigerante (ECT) abierto o en cortocircuito interno',
            confidence: 'ALTA',
          },
          {
            cause: 'Descarga de batería por operación continua del electroventilador en modo fallo',
            confidence: 'ALTA',
          },
        ],
        verificationSteps: pasosFrontier,
        correlations:
          'Al fallar la señal del sensor ECT (P0115), la ECU asume sobrecalentamiento y fuerza el electroventilador al 100%, drenando la batería y provocando la caída de tensión (P0562).',
      },
      tokensUsed: 420,
      latencyMs: 1290,
    },
  });

  const ordenFrontier = await prisma.workOrder.create({
    data: {
      scanId: scanFrontierActual.id,
      diagnosisId: diagnosisFrontier.id,
      vehicleId: frontier.id,
      assignedToId: null,
      status: WorkOrderStatus.OPEN,
      priority: WorkOrderPriority.HIGH,
      description:
        'Revisión de circuito de sensor de temperatura ECT (P0115) y caída de tensión 12.1V (P0562)',
      notes: '[2026-11-22] Orden disponible en bandeja general de taller para que un mecánico la tome.',
      n8nNotified: true,
      createdAt: haceDias(0, 6),
    },
  });

  await prisma.workOrderTask.createMany({
    data: pasosFrontier.map((desc) => ({
      workOrderId: ordenFrontier.id,
      description: desc,
      completed: false,
    })),
  });

  // ORG 2 (FCET): TOYOTA PRADO (3895-CET) -> Orden Completada por Mecánico 5 (Hernán Justiniano)
  const scanPradoAntiguo = await prisma.scan.create({
    data: {
      vehicleId: prado.id,
      scannedById: inspExactas.id,
      batteryVoltage: 13.8,
      scannedAt: haceDias(21),
      severity: ScanSeverity.MEDIUM,
      aiProcessed: true,
      notes: 'El indicador de temperatura tarda en subir en carretera.',
      rationale: 'Código confirmado P0128 (temperatura de refrigerante por debajo del termostato).',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: true,
        dtcCount: 1,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 81 07 65 00',
      },
      dtcEntries: {
        create: [{ code: 'P0128', type: DtcType.CONFIRMED, catalogCode: 'P0128' }],
      },
    },
  });

  const diagPrado = await prisma.diagnosis.create({
    data: {
      scanId: scanPradoAntiguo.id,
      provider: 'claude',
      prompt: 'Analizar P0128 CONFIRMED en Toyota Land Cruiser Prado 4.0L',
      response: 'Termostato trabado en posición abierta.',
      summary:
        'El motor no alcanza su temperatura operativa nominal en el tiempo previsto por la ECU (P0128). Causa típica: termostato mecánico trabado parcialmente abierto.',
      severity: 'MEDIUM',
      recommendations: {
        probableCauses: [
          {
            cause: 'Termostato de refrigeración trabado en posición abierta',
            confidence: 'ALTA',
          },
        ],
        verificationSteps: [
          'Desmontar alojamiento de termostato, reemplazar termostato 82°C y purgar sistema',
        ],
        correlations: null,
      },
      tokensUsed: 310,
      latencyMs: 980,
    },
  });

  const ordenPrado = await prisma.workOrder.create({
    data: {
      scanId: scanPradoAntiguo.id,
      diagnosisId: diagPrado.id,
      vehicleId: prado.id,
      assignedToId: mec5.id,
      closedById: mec5.id,
      status: WorkOrderStatus.COMPLETED,
      priority: WorkOrderPriority.MEDIUM,
      description: 'Reemplazo de termostato de refrigeración por código P0128',
      notes:
        '[2026-11-02] Cierre (COMPLETED) por Hernán Justiniano (Tren Motriz): Se reemplazó termostato original 82°C y sello. Temperatura estabilizada en 88°C.',
      n8nNotified: true,
      operationAuthorized: true,
      createdAt: haceDias(21),
      closedAt: haceDias(20, 2),
    },
  });

  await prisma.workOrderPart.create({
    data: {
      workOrderId: ordenPrado.id,
      sparePartId: repTermostato.id,
      quantity: 1,
      unitCost: repTermostato.unitCost,
      notes: 'Termostato Toyota 82°C con empaque.',
    },
  });

  await prisma.scan.create({
    data: {
      vehicleId: prado.id,
      scannedById: inspExactas.id,
      batteryVoltage: 14.1,
      scannedAt: haceDias(5),
      severity: ScanSeverity.NONE,
      aiProcessed: false,
      notes: 'Inspección periódica sin novedades.',
      rationale: 'Sin códigos de falla. Monitores completos.',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: false,
        dtcCount: 0,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 00 07 65 00',
      },
    },
  });

  await prisma.scan.create({
    data: {
      vehicleId: vitaraCet.id,
      scannedById: inspExactas.id,
      batteryVoltage: 13.9,
      scannedAt: haceDias(6),
      severity: ScanSeverity.NONE,
      aiProcessed: false,
      notes: 'Inspección previa a comisión de laboratorio.',
      rationale: 'Sin códigos de falla activos ni pendientes.',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: false,
        dtcCount: 0,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 00 07 65 00',
      },
    },
  });

  // ==========================================================================
  // ORG 3 (FMVZ - VETERINARIA): HILUX (4012-UAG) Y FRONTIER (4618-VET)
  // ==========================================================================
  const scanHiluxFalla = await prisma.scan.create({
    data: {
      vehicleId: hilux.id,
      scannedById: inspVeterinaria.id,
      batteryVoltage: 13.6,
      scannedAt: haceDias(14),
      severity: ScanSeverity.MEDIUM,
      aiProcessed: true,
      notes: 'Consumo elevado de combustible reportado en viaje a Camiri.',
      rationale:
        'Código confirmado P0171 (sistema demasiado pobre Banco 1) con monitores completos.',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: true,
        dtcCount: 1,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 81 07 65 00',
      },
      dtcEntries: {
        create: [{ code: 'P0171', type: DtcType.CONFIRMED, catalogCode: 'P0171' }],
      },
    },
  });

  const diagnosisHilux = await prisma.diagnosis.create({
    data: {
      scanId: scanHiluxFalla.id,
      provider: 'claude',
      prompt: 'Analizar P0171 CONFIRMED en Toyota Hilux 2.7L 2019',
      response: 'Mezcla pobre en Banco 1 por lectura subestimada de flujo de aire o sonda A/F.',
      summary:
        'El ajuste de combustible a largo plazo superó el límite positivo en el Banco 1 (P0171). En motores 2TR-FE 2.7L de uso rural, la causa principal es contaminación por polvo en el sensor MAF o degradación del sensor A/F primario.',
      severity: 'MEDIUM',
      recommendations: {
        probableCauses: [
          {
            cause: 'Sensor MAF contaminado por polvo fino y filtro de aire saturado',
            confidence: 'ALTA',
          },
          {
            cause: 'Sensor de relación Aire/Combustible (Banco 1 Sensor 1) con respuesta lenta',
            confidence: 'MEDIA',
          },
        ],
        verificationSteps: [
          'Reemplazar filtro de aire primario y limpiar filamento del sensor MAF',
          'Verificar respuesta de voltaje de sonda A/F Banco 1 Sensor 1 con escáner',
        ],
        correlations: null,
      },
      tokensUsed: 360,
      latencyMs: 1120,
    },
  });

  const ordenHilux = await prisma.workOrder.create({
    data: {
      scanId: scanHiluxFalla.id,
      diagnosisId: diagnosisHilux.id,
      vehicleId: hilux.id,
      assignedToId: mec2.id,
      closedById: mec2.id,
      status: WorkOrderStatus.COMPLETED,
      priority: WorkOrderPriority.MEDIUM,
      description: 'Corrección de mezcla pobre en Banco 1 (P0171) y mantenimiento de admisión',
      notes:
        '[2026-11-08] Javier Vargas (Mecánico Diésel) tomó la orden.\n' +
        '[2026-11-09] Cierre (COMPLETED) por Javier Vargas: Se reemplazó filtro de aire saturado, se realizó limpieza dieléctrica del sensor MAF y se reemplazó sonda A/F Banco 1.',
      n8nNotified: true,
      operationAuthorized: true,
      createdAt: haceDias(14),
      closedAt: haceDias(13, 4),
    },
  });

  await prisma.workOrderPart.createMany({
    data: [
      {
        workOrderId: ordenHilux.id,
        sparePartId: repFiltroAire.id,
        quantity: 1,
        unitCost: repFiltroAire.unitCost,
        notes: 'Filtro primario nuevo.',
      },
      {
        workOrderId: ordenHilux.id,
        sparePartId: repLimpiador.id,
        quantity: 1,
        unitCost: repLimpiador.unitCost,
        notes: 'Limpieza de sensor MAF.',
      },
      {
        workOrderId: ordenHilux.id,
        sparePartId: repSensorO2.id,
        quantity: 1,
        unitCost: repSensorO2.unitCost,
        notes: 'Reemplazo de sensor A/F Banco 1 Sensor 1.',
      },
    ],
  });

  await prisma.scan.create({
    data: {
      vehicleId: hilux.id,
      scannedById: inspVeterinaria.id,
      batteryVoltage: 14.0,
      scannedAt: haceDias(4),
      severity: ScanSeverity.NONE,
      aiProcessed: false,
      notes: 'Escaneo de control post-reparación tras recorrido a Warnes.',
      rationale: 'Lectura sin códigos DTC y todos los monitores de emisiones completados.',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: false,
        dtcCount: 0,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 00 07 65 00',
      },
    },
  });

  const scanFrontierVet = await prisma.scan.create({
    data: {
      vehicleId: frontierVet.id,
      scannedById: inspVeterinaria.id,
      batteryVoltage: 13.4,
      scannedAt: haceDias(2),
      severity: ScanSeverity.MEDIUM,
      aiProcessed: true,
      notes: 'Luz Check Engine encendida tras viaje a granja Yabaré.',
      rationale: 'Código confirmado P0420 (eficiencia del sistema catalítico por debajo del umbral).',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: true,
        dtcCount: 1,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 81 07 65 00',
      },
      dtcEntries: {
        create: [{ code: 'P0420', type: DtcType.CONFIRMED, catalogCode: 'P0420' }],
      },
    },
  });

  const diagFrontierVet = await prisma.diagnosis.create({
    data: {
      scanId: scanFrontierVet.id,
      provider: 'claude',
      prompt: 'Analizar P0420 CONFIRMED en Nissan Frontier 2021',
      response: 'Baja capacidad de almacenamiento de oxígeno en convertidor catalítico Banco 1.',
      summary:
        'La señal del sensor de oxígeno post-catalizador oscila de forma similar al sensor pre-catalizador (P0420), indicando saturación del catalizador o fuga en junta de escape.',
      severity: 'MEDIUM',
      recommendations: {
        probableCauses: [
          {
            cause: 'Degradación térmica del sustrato cerámico del catalizador Banco 1',
            confidence: 'ALTA',
          },
          {
            cause: 'Fuga en brida de escape antes del sensor de oxígeno secundario',
            confidence: 'MEDIA',
          },
        ],
        verificationSteps: [
          'Comparar curvas de voltaje de sensores O2 B1S1 y B1S2 a 2.000 RPM constantes',
          'Inspeccionar hermeticidad de múltiple y brida del catalizador',
        ],
        correlations: null,
      },
      tokensUsed: 375,
      latencyMs: 1150,
    },
  });

  await prisma.workOrder.create({
    data: {
      scanId: scanFrontierVet.id,
      diagnosisId: diagFrontierVet.id,
      vehicleId: frontierVet.id,
      assignedToId: mec4.id,
      status: WorkOrderStatus.IN_PROGRESS,
      priority: WorkOrderPriority.MEDIUM,
      description: 'Evaluación de eficiencia catalítica y sensores de oxígeno Banco 1 (P0420)',
      notes:
        '[2026-11-20] Diego Peñaranda (Inyección OBD): En revisión de curvas de sonda lambda en Bahía 4.',
      n8nNotified: true,
      createdAt: haceDias(2),
    },
  });

  // ==========================================================================
  // ORG 4 (FICCT - COMPUTACIÓN): URVAN (4471-BUS) Y VITARA (5033-ICC)
  // ==========================================================================
  await prisma.scan.create({
    data: {
      vehicleId: urvan.id,
      scannedById: inspComputacion.id,
      batteryVoltage: 13.9,
      scannedAt: haceDias(3),
      severity: ScanSeverity.NONE,
      aiProcessed: false,
      notes: 'Inspección preventiva antes de traslado de delegación FICCT.',
      rationale: 'Sin códigos de falla. Monitores de preparación completos.',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: false,
        dtcCount: 0,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 00 07 65 00',
      },
    },
  });

  const scanVitaraFicct = await prisma.scan.create({
    data: {
      vehicleId: vitaraFicct.id,
      scannedById: inspComputacion.id,
      batteryVoltage: 13.2,
      scannedAt: haceDias(1, 3),
      severity: ScanSeverity.HIGH,
      aiProcessed: true,
      notes: 'Olor a combustible cerca del tanque y ralentí inestable.',
      rationale:
        'Códigos confirmados P0456 (fuga en sistema EVAP) y P0302 (fallo de encendido en cilindro 2).',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: true,
        dtcCount: 2,
        monitorsCompleted: true,
        incompleteMonitors: [],
        rawHex: '41 01 82 07 65 00',
      },
      dtcEntries: {
        create: [
          { code: 'P0456', type: DtcType.CONFIRMED, catalogCode: 'P0456' },
          { code: 'P0302', type: DtcType.CONFIRMED, catalogCode: 'P0302' },
        ],
      },
    },
  });

  const diagVitaraFicct = await prisma.diagnosis.create({
    data: {
      scanId: scanVitaraFicct.id,
      provider: 'claude',
      prompt: 'Analizar P0456 CONFIRMED y P0302 CONFIRMED en Suzuki Grand Vitara 2.4L',
      response: 'Válvula de purga EVAP abierta y fallo de encendido en cilindro 2.',
      summary:
        'Se detecta fuga evaporativa (P0456) junto con fallo de encendido en el cilindro 2 (P0302). Una válvula solenoide de purga EVAP que no sella altera la mezcla en ralentí, sumado a posible desgaste de bujía en cilindro 2.',
      severity: 'HIGH',
      recommendations: {
        probableCauses: [
          {
            cause: 'Válvula solenoide de purga EVAP con cierre defectuoso',
            confidence: 'ALTA',
          },
          {
            cause: 'Bujía o bobina del cilindro 2 con desgaste',
            confidence: 'ALTA',
          },
        ],
        verificationSteps: [
          'Comprobar estanqueidad de la válvula de purga EVAP aplicando vacío',
          'Reemplazar bujía del cilindro 2 y verificar bobina',
        ],
        correlations:
          'Una fuga de vacío a través de la válvula EVAP afecta la estabilidad del ralentí y acentúa el fallo de combustión en el cilindro 2.',
      },
      tokensUsed: 390,
      latencyMs: 1210,
    },
  });

  const ordenVitaraFicct = await prisma.workOrder.create({
    data: {
      scanId: scanVitaraFicct.id,
      diagnosisId: diagVitaraFicct.id,
      vehicleId: vitaraFicct.id,
      assignedToId: mec4.id,
      status: WorkOrderStatus.OPEN,
      priority: WorkOrderPriority.HIGH,
      description: 'Revisión de válvula de purga EVAP (P0456) y encendido cilindro 2 (P0302)',
      notes:
        '[2026-11-21] Orden creada tras escaneo de Valeria Suárez (FICCT) y asignada a Diego Peñaranda.',
      n8nNotified: true,
      createdAt: haceDias(1, 3),
    },
  });

  await prisma.workOrderPart.create({
    data: {
      workOrderId: ordenVitaraFicct.id,
      sparePartId: repValvulaEvap.id,
      quantity: 1,
      unitCost: repValvulaEvap.unitCost,
      notes: 'Solenoide EVAP reservado para reemplazo.',
    },
  });

  // ==========================================================================
  // ORG 5 (FP - POLITÉCNICA): MINIBÚS HIACE (3110-BUS) Y L200 (3722-POL)
  // ==========================================================================
  await prisma.scan.create({
    data: {
      vehicleId: coaster.id,
      scannedById: inspPolitecnica.id,
      batteryVoltage: 12.6,
      scannedAt: haceDias(2),
      severity: ScanSeverity.LOW,
      aiProcessed: false,
      notes:
        'Batería desconectada en taller el fin de semana para limpieza de bornes. Re-escanear tras completar ciclo de conducción.',
      rationale:
        'Código pendiente (P2195) con 3 monitores incompletos (posible reinicio reciente de batería). Lectura no concluyente: mantener en seguimiento.',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: false,
        dtcCount: 0,
        monitorsCompleted: false,
        incompleteMonitors: ['Catalizador', 'Sensor de Oxígeno', 'Sistema EVAP'],
        rawHex: '41 01 00 07 65 25',
        batteryResetSuspected: true,
      },
      dtcEntries: {
        create: [{ code: 'P2195', type: DtcType.PENDING, catalogCode: 'P2195' }],
      },
    },
  });

  await prisma.scan.create({
    data: {
      vehicleId: l200Poli.id,
      scannedById: inspPolitecnica.id,
      batteryVoltage: 14.0,
      scannedAt: haceDias(4),
      severity: ScanSeverity.NONE,
      aiProcessed: false,
      notes: 'Control preventivo en taller de Facultad Politécnica.',
      rationale: 'Sin códigos de falla. Monitores completos.',
      protocol: protocoloCan,
      readinessStatus: {
        milOn: false,
        dtcCount: 0,
        monitorsCompleted: true,
        incompleteMonitors: [],
        compressionIgnition: true,
        rawHex: '41 01 00 0F 65 00',
      },
    },
  });

  // ==========================================================================
  // BITÁCORA DE NOTIFICACIONES MULTI-CANAL Y AUDITORÍA
  // ==========================================================================
  await prisma.notificationLog.createMany({
    data: [
      {
        workOrderId: ordenHilux.id,
        recipientId: mec2.id,
        channel: NotificationChannel.TELEGRAM,
        status: NotificationStatus.SENT,
        subject: 'Alerta n8n (Telegram + Email): Orden de prioridad MEDIA para 4012-UAG (P0171)',
        sentAt: haceDias(14),
      },
      {
        workOrderId: ordenHilux.id,
        recipientId: inspVeterinaria.id,
        channel: NotificationChannel.PUSH,
        status: NotificationStatus.SENT,
        subject: 'Push FCM: Orden completada — Vehículo 4012-UAG autorizado para operación',
        sentAt: haceDias(13, 4),
      },
      {
        workOrderId: ordenL200.id,
        recipientId: mec3.id,
        channel: NotificationChannel.TELEGRAM,
        status: NotificationStatus.SENT,
        subject: 'Alerta n8n (Telegram + Email): Nueva orden para 5190-MIT (Sensor MAF P0102)',
        sentAt: haceDias(3),
      },
      {
        workOrderId: ordenVitaraFicct.id,
        recipientId: mec4.id,
        channel: NotificationChannel.TELEGRAM,
        status: NotificationStatus.SENT,
        subject: 'Alerta n8n (Telegram + Email): Nueva orden ALTA para 5033-ICC (P0456 / P0302)',
        sentAt: haceDias(1, 3),
      },
      {
        workOrderId: ordenTacoma.id,
        recipientId: mec1.id,
        channel: NotificationChannel.TELEGRAM,
        status: NotificationStatus.SENT,
        subject:
          'Alerta CRÍTICA n8n (Telegram + Email): Fallo de encendido recurrente en 5521-TAC (P0300, P0301)',
        sentAt: haceDias(1),
      },
      {
        workOrderId: ordenTacoma.id,
        recipientId: inspAgricolas.id,
        channel: NotificationChannel.PUSH,
        status: NotificationStatus.SENT,
        subject: 'Notificación Push FCM: Su vehículo 5521-TAC entró a revisión prioritaria',
        sentAt: haceDias(1),
      },
      {
        workOrderId: ordenFrontier.id,
        recipientId: null,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.SENT,
        subject:
          'Alerta n8n a los 5 mecánicos: Orden ABIERTA sin asignar para 4829-NFP (P0115 / P0562 — 12.1V)',
        sentAt: haceDias(0, 6),
      },
      {
        workOrderId: ordenFrontier.id,
        recipientId: inspExactas.id,
        channel: NotificationChannel.PUSH,
        status: NotificationStatus.SENT,
        subject: 'Notificación Push FCM: Orden generada para 4829-NFP tras escaneo con 2 códigos',
        sentAt: haceDias(0, 6),
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        userId: admin.id,
        action: 'SEED_INIT',
        entity: 'CATALOG',
        summary:
          'Inicialización de 5 unidades organizacionales con sus 5 inspectores, 5 mecánicos de taller y 12 vehículos',
        createdAt: haceDias(30),
      },
      {
        userId: mec5.id,
        action: 'CLOSE_ORDER',
        entity: 'WORK_ORDER',
        entityId: ordenPrado.id,
        summary:
          'Orden cerrada como COMPLETED por Hernán Justiniano: Termostato reemplazado (3895-CET vuelve a Operativo)',
        createdAt: haceDias(20, 2),
      },
      {
        userId: mec2.id,
        action: 'CLOSE_ORDER',
        entity: 'WORK_ORDER',
        entityId: ordenHilux.id,
        summary:
          'Orden cerrada como COMPLETED por Javier Vargas: Filtro, limpieza MAF y sensor A/F reemplazados (4012-UAG Operativo)',
        createdAt: haceDias(13, 4),
      },
      {
        userId: inspAgricolas.id,
        action: 'SCAN',
        entity: 'SCAN',
        entityId: scanTacomaActual.id,
        summary:
          'Escaneo OBD-II registrado por Carlos Inspector (FCA) para 5521-TAC — Severidad: CRITICAL',
        createdAt: haceDias(1),
      },
      {
        userId: inspComputacion.id,
        action: 'SCAN',
        entity: 'SCAN',
        entityId: scanVitaraFicct.id,
        summary:
          'Escaneo OBD-II registrado por Valeria Suárez (FICCT) para 5033-ICC — Severidad: HIGH',
        createdAt: haceDias(1, 3),
      },
      {
        userId: inspExactas.id,
        action: 'SCAN',
        entity: 'SCAN',
        entityId: scanFrontierActual.id,
        summary:
          'Escaneo OBD-II registrado por Lucía Mendoza (FCET) para 4829-NFP — Severidad: HIGH',
        createdAt: haceDias(0, 6),
      },
    ],
  });

  console.log('✅ Seed de demostración UAGRM completado exitosamente:', {
    organizaciones: 5,
    inspectores: 5,
    mecanicos: 5,
    vehiculos: 12,
    escaneos: 16,
    hipotesisIA: 8,
    ordenesDeTrabajo: 7,
    repuestosEnInventario: 9,
  });
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (pool) await pool.end();
  });
