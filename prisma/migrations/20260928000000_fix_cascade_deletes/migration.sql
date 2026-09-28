-- Corrige la divergencia entre schema.prisma y la base de datos.
--
-- La migración inicial (20260926000000_init) se escribió a mano y creó cinco
-- claves foráneas con ON DELETE RESTRICT, mientras que schema.prisma declara
-- onDelete: Cascade en esas mismas relaciones.
--
-- Síntoma observable: DELETE /vehicles/:id devolvía 500 (Prisma P2003,
-- "Foreign key constraint violated: scans_vehicleId_fkey") para cualquier
-- vehículo que tuviera al menos un escaneo.
--
-- Causa de fondo: Prisma genera sus queries confiando en lo declarado en el
-- schema. Si la base no lo respeta, cualquier comportamiento que dependa de
-- borrado en cascada es incorrecto.
--
-- Esta migración es idempotente: puede ejecutarse varias veces sin efecto
-- adicional.

-- scans.vehicleId -> vehicles.id  (borrar un vehículo borra sus escaneos)
ALTER TABLE "scans" DROP CONSTRAINT IF EXISTS "scans_vehicleId_fkey";
ALTER TABLE "scans" ADD CONSTRAINT "scans_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- dtc_entries.scanId -> scans.id  (borrar un escaneo borra sus códigos DTC)
ALTER TABLE "dtc_entries" DROP CONSTRAINT IF EXISTS "dtc_entries_scanId_fkey";
ALTER TABLE "dtc_entries" ADD CONSTRAINT "dtc_entries_scanId_fkey"
  FOREIGN KEY ("scanId") REFERENCES "scans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- diagnoses.scanId -> scans.id  (borrar un escaneo borra su hipótesis de IA)
ALTER TABLE "diagnoses" DROP CONSTRAINT IF EXISTS "diagnoses_scanId_fkey";
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_scanId_fkey"
  FOREIGN KEY ("scanId") REFERENCES "scans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- work_orders.scanId -> scans.id  (borrar un escaneo borra su orden derivada)
ALTER TABLE "work_orders" DROP CONSTRAINT IF EXISTS "work_orders_scanId_fkey";
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_scanId_fkey"
  FOREIGN KEY ("scanId") REFERENCES "scans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- work_orders.vehicleId -> vehicles.id  (borrar un vehículo borra sus órdenes)
ALTER TABLE "work_orders" DROP CONSTRAINT IF EXISTS "work_orders_vehicleId_fkey";
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Las tres FK restantes ya coincidían con el schema y NO se tocan:
--   scans_scannedById_fkey        RESTRICT  (no se borra un usuario con escaneos)
--   work_orders_diagnosisId_fkey  SET NULL
--   work_orders_assignedToId_fkey SET NULL
