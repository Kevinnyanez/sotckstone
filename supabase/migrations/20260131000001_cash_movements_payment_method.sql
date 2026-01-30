-- Caja: desglose por método de pago (efectivo vs otros) para reportes.
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS payment_method text;

COMMENT ON COLUMN cash_movements.payment_method IS 'CASH, TRANSFER, CARD, OTHER. Null para movimientos sin método (ej. ajustes antiguos).';
