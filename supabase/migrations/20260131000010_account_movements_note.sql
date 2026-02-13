-- Columna descripción/nota en movimientos de cuenta (deuda manual, fiado desde POS, etc.)
ALTER TABLE account_movements
  ADD COLUMN IF NOT EXISTS note text;

COMMENT ON COLUMN account_movements.note IS 'Descripción de la deuda (ej. qué se llevó fiado) o nota del movimiento.';
