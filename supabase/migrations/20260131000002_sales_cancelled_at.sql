-- Permitir anular ventas: todo se revierte (stock, caja, cuenta).
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

COMMENT ON COLUMN sales.cancelled_at IS 'Si no es null, la venta está anulada; stock, caja y cuenta deben estar revertidos.';
