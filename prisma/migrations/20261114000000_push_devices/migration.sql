-- Dispositivos registrados para notificaciones push (CU18).
--
-- Cada fila es un teléfono con la sesión iniciada: guarda el token que
-- Firebase le entrega a la app y a qué cuenta pertenece. El backend envía el
-- push de una orden nueva a los dispositivos de administradores y mecánicos.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS "devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "devices_token_key" ON "devices"("token");
CREATE INDEX IF NOT EXISTS "devices_userId_idx" ON "devices"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'devices_userId_fkey'
  ) THEN
    ALTER TABLE "devices"
      ADD CONSTRAINT "devices_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
