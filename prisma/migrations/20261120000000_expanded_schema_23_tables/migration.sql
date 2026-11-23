-- Expansión del modelo de datos a 23 tablas para Taller de Grado (UAGRM).
-- Incluye:
--   1. Relación recursiva: organizational_units (parentId -> id)
--   2. Generalización / Especialización (Herencia 1:1): mechanic_profiles, inspector_profiles
--   3. Relación N:M con atributos: mechanic_specialties, work_order_parts
--   4. Normalización 3NF de flota: vehicle_categories, vehicle_brands, vehicle_models
--   5. Catálogo técnico OBD-II: obd_systems, dtc_catalog
--   6. Gestión de taller e inventario: work_order_tasks, spare_part_categories, spare_parts, work_order_status_history
--   7. Bitácoras y auditoría: audit_logs, notification_logs
--
-- Idempotente.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationChannel') THEN
    CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'TELEGRAM', 'EMAIL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationStatus') THEN
    CREATE TYPE "NotificationStatus" AS ENUM ('SENT', 'FAILED', 'PENDING');
  END IF;
END $$;

-- 1. Unidades Organizacionales (Recursiva)
CREATE TABLE IF NOT EXISTS "organizational_units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FACULTAD',
    "parentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizational_units_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organizational_units_code_key" ON "organizational_units"("code");
CREATE INDEX IF NOT EXISTS "organizational_units_parentId_idx" ON "organizational_units"("parentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizational_units_parentId_fkey') THEN
    ALTER TABLE "organizational_units"
      ADD CONSTRAINT "organizational_units_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "organizational_units"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- FK unitId en users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "unitId" TEXT;
CREATE INDEX IF NOT EXISTS "users_unitId_idx" ON "users"("unitId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_unitId_fkey') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_unitId_fkey"
      FOREIGN KEY ("unitId") REFERENCES "organizational_units"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 2. Generalización / Especialización de Usuarios (Herencia 1:1)
CREATE TABLE IF NOT EXISTS "mechanic_profiles" (
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "workshopBay" TEXT NOT NULL DEFAULT 'Bahía 1',
    "experienceYears" INTEGER NOT NULL DEFAULT 1,
    "shift" TEXT NOT NULL DEFAULT 'MAÑANA',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mechanic_profiles_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mechanic_profiles_employeeCode_key" ON "mechanic_profiles"("employeeCode");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mechanic_profiles_userId_fkey') THEN
    ALTER TABLE "mechanic_profiles"
      ADD CONSTRAINT "mechanic_profiles_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "inspector_profiles" (
    "userId" TEXT NOT NULL,
    "credentialNumber" TEXT NOT NULL,
    "assignedZone" TEXT NOT NULL DEFAULT 'Campus Universitario',
    "licenseCategory" TEXT NOT NULL DEFAULT 'B',
    "canAuthorizeRoute" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspector_profiles_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "inspector_profiles_credentialNumber_key" ON "inspector_profiles"("credentialNumber");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inspector_profiles_userId_fkey') THEN
    ALTER TABLE "inspector_profiles"
      ADD CONSTRAINT "inspector_profiles_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "specialties" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "specialties_code_key" ON "specialties"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "specialties_name_key" ON "specialties"("name");

CREATE TABLE IF NOT EXISTS "mechanic_specialties" (
    "mechanicUserId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "certifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL DEFAULT 'SENIOR',

    CONSTRAINT "mechanic_specialties_pkey" PRIMARY KEY ("mechanicUserId","specialtyId")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mechanic_specialties_mechanicUserId_fkey') THEN
    ALTER TABLE "mechanic_specialties"
      ADD CONSTRAINT "mechanic_specialties_mechanicUserId_fkey"
      FOREIGN KEY ("mechanicUserId") REFERENCES "mechanic_profiles"("userId")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mechanic_specialties_specialtyId_fkey') THEN
    ALTER TABLE "mechanic_specialties"
      ADD CONSTRAINT "mechanic_specialties_specialtyId_fkey"
      FOREIGN KEY ("specialtyId") REFERENCES "specialties"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. Clasificación Jerárquica de Vehículos (3NF)
CREATE TABLE IF NOT EXISTS "vehicle_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inspectionCycleDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_categories_name_key" ON "vehicle_categories"("name");

CREATE TABLE IF NOT EXISTS "vehicle_brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryOrigin" TEXT DEFAULT 'Japón',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_brands_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_brands_name_key" ON "vehicle_brands"("name");

CREATE TABLE IF NOT EXISTS "vehicle_models" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "engineType" TEXT NOT NULL DEFAULT 'GASOLINA',
    "displacement" TEXT DEFAULT '2.7L',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_models_brandId_name_key" ON "vehicle_models"("brandId", "name");
CREATE INDEX IF NOT EXISTS "vehicle_models_brandId_idx" ON "vehicle_models"("brandId");
CREATE INDEX IF NOT EXISTS "vehicle_models_categoryId_idx" ON "vehicle_models"("categoryId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_models_brandId_fkey') THEN
    ALTER TABLE "vehicle_models"
      ADD CONSTRAINT "vehicle_models_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES "vehicle_brands"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_models_categoryId_fkey') THEN
    ALTER TABLE "vehicle_models"
      ADD CONSTRAINT "vehicle_models_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "modelId" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "unitId" TEXT;

CREATE INDEX IF NOT EXISTS "vehicles_modelId_idx" ON "vehicles"("modelId");
CREATE INDEX IF NOT EXISTS "vehicles_categoryId_idx" ON "vehicles"("categoryId");
CREATE INDEX IF NOT EXISTS "vehicles_unitId_idx" ON "vehicles"("unitId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_modelId_fkey') THEN
    ALTER TABLE "vehicles"
      ADD CONSTRAINT "vehicles_modelId_fkey"
      FOREIGN KEY ("modelId") REFERENCES "vehicle_models"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_categoryId_fkey') THEN
    ALTER TABLE "vehicles"
      ADD CONSTRAINT "vehicles_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "vehicle_categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_unitId_fkey') THEN
    ALTER TABLE "vehicles"
      ADD CONSTRAINT "vehicles_unitId_fkey"
      FOREIGN KEY ("unitId") REFERENCES "organizational_units"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. Catálogo Técnico OBD-II
CREATE TABLE IF NOT EXISTS "obd_systems" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obd_systems_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "obd_systems_prefix_key" ON "obd_systems"("prefix");
CREATE UNIQUE INDEX IF NOT EXISTS "obd_systems_name_key" ON "obd_systems"("name");

CREATE TABLE IF NOT EXISTS "dtc_catalog" (
    "code" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultSeverity" "ScanSeverity" NOT NULL DEFAULT 'MEDIUM',
    "commonCauses" TEXT,
    "isEmissionsRelated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dtc_catalog_pkey" PRIMARY KEY ("code")
);
CREATE INDEX IF NOT EXISTS "dtc_catalog_systemId_idx" ON "dtc_catalog"("systemId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dtc_catalog_systemId_fkey') THEN
    ALTER TABLE "dtc_catalog"
      ADD CONSTRAINT "dtc_catalog_systemId_fkey"
      FOREIGN KEY ("systemId") REFERENCES "obd_systems"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "dtc_entries" ADD COLUMN IF NOT EXISTS "catalogCode" TEXT;
CREATE INDEX IF NOT EXISTS "dtc_entries_catalogCode_idx" ON "dtc_entries"("catalogCode");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dtc_entries_catalogCode_fkey') THEN
    ALTER TABLE "dtc_entries"
      ADD CONSTRAINT "dtc_entries_catalogCode_fkey"
      FOREIGN KEY ("catalogCode") REFERENCES "dtc_catalog"("code")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Gestión de Taller, Tareas, Repuestos e Historial de Estados
CREATE TABLE IF NOT EXISTS "work_order_tasks" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "work_order_tasks_workOrderId_idx" ON "work_order_tasks"("workOrderId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_tasks_workOrderId_fkey') THEN
    ALTER TABLE "work_order_tasks"
      ADD CONSTRAINT "work_order_tasks_workOrderId_fkey"
      FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "spare_part_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spare_part_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "spare_part_categories_name_key" ON "spare_part_categories"("name");

CREATE TABLE IF NOT EXISTS "spare_parts" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spare_parts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "spare_parts_sku_key" ON "spare_parts"("sku");
CREATE INDEX IF NOT EXISTS "spare_parts_categoryId_idx" ON "spare_parts"("categoryId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'spare_parts_categoryId_fkey') THEN
    ALTER TABLE "spare_parts"
      ADD CONSTRAINT "spare_parts_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "spare_part_categories"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "work_order_parts" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "sparePartId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_parts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "work_order_parts_workOrderId_sparePartId_key" ON "work_order_parts"("workOrderId", "sparePartId");
CREATE INDEX IF NOT EXISTS "work_order_parts_workOrderId_idx" ON "work_order_parts"("workOrderId");
CREATE INDEX IF NOT EXISTS "work_order_parts_sparePartId_idx" ON "work_order_parts"("sparePartId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_parts_workOrderId_fkey') THEN
    ALTER TABLE "work_order_parts"
      ADD CONSTRAINT "work_order_parts_workOrderId_fkey"
      FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_parts_sparePartId_fkey') THEN
    ALTER TABLE "work_order_parts"
      ADD CONSTRAINT "work_order_parts_sparePartId_fkey"
      FOREIGN KEY ("sparePartId") REFERENCES "spare_parts"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "work_order_status_history" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "fromStatus" "WorkOrderStatus",
    "toStatus" "WorkOrderStatus" NOT NULL,
    "changedById" TEXT,
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "work_order_status_history_workOrderId_idx" ON "work_order_status_history"("workOrderId");
CREATE INDEX IF NOT EXISTS "work_order_status_history_changedById_idx" ON "work_order_status_history"("changedById");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_status_history_workOrderId_fkey') THEN
    ALTER TABLE "work_order_status_history"
      ADD CONSTRAINT "work_order_status_history_workOrderId_fkey"
      FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_status_history_changedById_fkey') THEN
    ALTER TABLE "work_order_status_history"
      ADD CONSTRAINT "work_order_status_history_changedById_fkey"
      FOREIGN KEY ("changedById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 6. Bitácoras de Auditoría y Notificaciones
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_userId_fkey') THEN
    ALTER TABLE "audit_logs"
      ADD CONSTRAINT "audit_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "notification_logs" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT,
    "recipientId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'SENT',
    "subject" TEXT NOT NULL,
    "errorDetail" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notification_logs_workOrderId_idx" ON "notification_logs"("workOrderId");
CREATE INDEX IF NOT EXISTS "notification_logs_recipientId_idx" ON "notification_logs"("recipientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_workOrderId_fkey') THEN
    ALTER TABLE "notification_logs"
      ADD CONSTRAINT "notification_logs_workOrderId_fkey"
      FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_recipientId_fkey') THEN
    ALTER TABLE "notification_logs"
      ADD CONSTRAINT "notification_logs_recipientId_fkey"
      FOREIGN KEY ("recipientId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
