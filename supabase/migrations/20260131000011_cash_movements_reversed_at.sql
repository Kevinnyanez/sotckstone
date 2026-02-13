-- Marcar movimientos de caja anulados (ej. anulación de pago) para no contarlos en reportes ni como ingreso ni como egreso.
ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN cash_movements.reversed_at IS 'Si no es null, el movimiento está anulado (ej. pago de deuda anulado). No se cuenta en reportes.';
