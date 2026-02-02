-- Quitar UNIQUE del código de barras para permitir el mismo barcode en varios productos
-- (ej. misma prenda, distinto talle/color). El SKU se mantiene único.

DO $$
DECLARE
  conname_to_drop text;
BEGIN
  SELECT c.conname INTO conname_to_drop
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) AND NOT a.attisdropped
  WHERE t.relname = 'products'
    AND c.contype = 'u'
    AND a.attname = 'barcode'
  LIMIT 1;

  IF conname_to_drop IS NOT NULL THEN
    EXECUTE format('ALTER TABLE products DROP CONSTRAINT %I', conname_to_drop);
  END IF;
END $$;
