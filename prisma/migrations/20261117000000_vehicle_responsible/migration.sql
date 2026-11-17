-- Responsable de cada vehículo.
--
-- Cada vehículo puede tener un inspector responsable: es quien recibe el aviso
-- cuando su vehículo necesita revisión y cuando la orden se cierra. Si la
-- cuenta se borra, el vehículo queda sin responsable (SET NULL).
--
-- Idempotente.

ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "responsibleId" TEXT;

CREATE INDEX IF NOT EXISTS "vehicles_responsibleId_idx" ON "vehicles"("responsibleId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_responsibleId_fkey'
  ) THEN
    ALTER TABLE "vehicles"
      ADD CONSTRAINT "vehicles_responsibleId_fkey"
      FOREIGN KEY ("responsibleId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
