-- Asegurar que size (talle) sea texto para guardar valores como S, L, M, etc.
-- Si la columna era numérica, "s" y "l" no se guardaban y aparecían como null (—).

DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'size';

  IF col_type IS NULL THEN
    ALTER TABLE products ADD COLUMN size text;
  ELSIF col_type <> 'text' AND col_type <> 'character varying' THEN
    ALTER TABLE products
      ALTER COLUMN size TYPE text USING (CASE WHEN size IS NOT NULL THEN size::text ELSE NULL END);
  END IF;
END $$;
