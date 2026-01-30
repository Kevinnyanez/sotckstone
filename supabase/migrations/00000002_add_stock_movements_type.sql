-- Ejecutar en Supabase SQL Editor si stock_movements no tiene la columna type.
-- Soluciona: "Could not find the 'type' column of 'stock_movements' in the schema cache"
-- type = IN | OUT (dirección del movimiento), independiente de channel.

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS type text;

UPDATE stock_movements SET type = CASE WHEN quantity < 0 THEN 'OUT' ELSE 'IN' END WHERE type IS NULL;
ALTER TABLE stock_movements ALTER COLUMN type SET NOT NULL;
ALTER TABLE stock_movements ALTER COLUMN type SET DEFAULT 'OUT';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_type_check') THEN
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_check CHECK (type IN ('IN', 'OUT'));
  END IF;
END $$;

COMMENT ON COLUMN stock_movements.type IS 'Dirección del movimiento: IN o OUT. Independiente de channel.';
