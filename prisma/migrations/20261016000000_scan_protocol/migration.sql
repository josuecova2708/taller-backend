-- Protocolo OBD-II con el que el adaptador se comunicó con la ECU.
--
-- Se obtiene de `ATDPN` en el móvil y es el dato que decide cómo parsear las
-- respuestas de DTC: en CAN (ISO 15765-4) el Modo 03 trae byte de conteo de
-- códigos; en ISO 9141-2 y KWP2000 no. Se persiste para trazabilidad: permite
-- saber con qué protocolo se leyó cada vehículo y auditar un parseo dudoso.
--
-- Idempotente.

ALTER TABLE "scans" ADD COLUMN IF NOT EXISTS "protocol" JSONB;
