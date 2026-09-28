-- Fase 2: el readiness de monitores OBD es un dato GLOBAL por escaneo
-- (Mode 01 PID 01), no un atributo por DTC.
--
-- Se mueve el estado de monitores a "scans"."readinessStatus" (JSONB) y se
-- elimina "dtc_entries"."monitorStatus" junto con su tipo enum.
--
-- Estas sentencias vivían sueltas dentro de `ensureSchema()` en prisma/seed.ts.
-- Se trasladan acá para que el historial de cambios de esquema esté completo
-- en un solo lugar.
--
-- Idempotente: puede ejecutarse varias veces sin efecto adicional.

ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "readinessStatus" JSONB;
ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "notes" TEXT;

ALTER TABLE "dtc_entries" DROP COLUMN IF EXISTS "monitorStatus";
DROP TYPE IF EXISTS "MonitorStatus";
