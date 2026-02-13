-- Agregar dirección al cliente (reemplazo de email en uso).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address text;
COMMENT ON COLUMN customers.address IS 'Dirección del cliente.';
