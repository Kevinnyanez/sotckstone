-- Agregar CONSUME_CREDIT al enum de movimientos de cuenta (uso de crédito a favor en venta)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_movement_type')
     AND NOT EXISTS (
       SELECT 1 FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'account_movement_type' AND e.enumlabel = 'CONSUME_CREDIT'
     ) THEN
    ALTER TYPE account_movement_type ADD VALUE 'CONSUME_CREDIT';
  END IF;
END$$;
