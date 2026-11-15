-- Reglas de negocio de los casos de uso CU02, CU03, CU07 y CU16.
--
-- 1. Baja lógica de usuarios y vehículos (`active`): antes "dar de baja" un
--    vehículo era un DELETE que arrastraba en cascada sus escaneos y órdenes,
--    es decir, todo el historial de mantenimiento.
-- 2. Dictamen determinístico en columna propia (`scans.rationale`): antes
--    compartía `notes` con la observación del inspector, y si el inspector
--    escribía algo el dictamen se perdía.
-- 3. Cierre de la orden con responsable y fecha, y autorización explícita de
--    la operación del vehículo.
--
-- Idempotente.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "rationale" TEXT;
-- En los escaneos anteriores `notes` es lo único que hay: se copia para que
-- el dictamen siga disponible (en casi todos es exactamente el dictamen).
UPDATE "scans" SET "rationale" = "notes" WHERE "rationale" IS NULL AND "notes" IS NOT NULL;

ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "closedById" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "operationAuthorized" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_closedById_fkey'
  ) THEN
    ALTER TABLE "work_orders"
      ADD CONSTRAINT "work_orders_closedById_fkey"
      FOREIGN KEY ("closedById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
