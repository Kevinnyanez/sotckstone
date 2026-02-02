-- Agregar valor INITIAL al enum stock_movement_type para stock inicial al crear producto.
-- Soluciona: invalid input value for enum stock_movement_type: "INITIAL"

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_movement_type') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'stock_movement_type' AND e.enumlabel = 'INITIAL'
    ) THEN
      ALTER TYPE stock_movement_type ADD VALUE 'INITIAL';
    END IF;
  END IF;
END $$;
