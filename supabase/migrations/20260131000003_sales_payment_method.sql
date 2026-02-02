-- Método de pago en la venta (para anulaciones y reportes).
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payment_method text;

COMMENT ON COLUMN sales.payment_method IS 'CASH, TRANSFER, CARD, OTHER. Null en ventas antiguas.';
