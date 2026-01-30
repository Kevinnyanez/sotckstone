-- Ejecutar en Supabase SQL Editor si stock_movements no tiene la columna channel.
-- Soluciona: "Could not find the 'channel' column of 'stock_movements' in the schema cache"

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'LOCAL';

UPDATE stock_movements SET channel = 'LOCAL' WHERE channel IS NULL;
ALTER TABLE stock_movements ALTER COLUMN channel SET NOT NULL;
ALTER TABLE stock_movements ALTER COLUMN channel SET DEFAULT 'LOCAL';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_channel_check') THEN
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_channel_check CHECK (channel IN ('LOCAL', 'MERCADOLIBRE'));
  END IF;
END $$;
