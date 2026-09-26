-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('INSPECTOR', 'MECHANIC', 'ADMIN');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('OK', 'ALERT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DtcType" AS ENUM ('CONFIRMED', 'PENDING', 'PERMANENT');

-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('COMPLETED', 'NOT_COMPLETED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ScanSeverity" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'INSPECTOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "vin" TEXT,
    "plate" TEXT NOT NULL,
    "alias" TEXT,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "status" "VehicleStatus" NOT NULL DEFAULT 'OK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "scannedById" TEXT NOT NULL,
    "batteryVoltage" DOUBLE PRECISION,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "severity" "ScanSeverity" NOT NULL DEFAULT 'NONE',
    "aiProcessed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dtc_entries" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "DtcType" NOT NULL,
    "monitorStatus" "MonitorStatus" NOT NULL DEFAULT 'UNKNOWN',

    CONSTRAINT "dtc_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnoses" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "tokensUsed" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "diagnosisId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "WorkOrderPriority" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "n8nNotified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "diagnoses_scanId_key" ON "diagnoses"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_scanId_key" ON "work_orders"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_diagnosisId_key" ON "work_orders"("diagnosisId");

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dtc_entries" ADD CONSTRAINT "dtc_entries_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_diagnosisId_fkey" FOREIGN KEY ("diagnosisId") REFERENCES "diagnoses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

