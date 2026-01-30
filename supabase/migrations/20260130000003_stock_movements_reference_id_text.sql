-- reference_id como text permite idempotencia: 'SIMULATED' o order_id de ML.
-- Evita doble descuento si el webhook se repite (mismo reference_id = mismo movimiento).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'reference_id'
  ) AND (
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'reference_id'
  ) = 'uuid' THEN
    ALTER TABLE stock_movements
      ALTER COLUMN reference_id TYPE text USING reference_id::text;
  END IF;
END $$;
