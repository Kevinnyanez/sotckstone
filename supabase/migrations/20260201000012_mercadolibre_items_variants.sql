-- Tablas para cachear publicaciones y variaciones de Mercado Libre.
-- No modifican la vinculación existente en external_variants.

CREATE TABLE IF NOT EXISTS mercadolibre_items (
  item_id text PRIMARY KEY,
  title text,
  status text,
  site_id text,
  category_id text,
  price numeric,
  currency_id text,
  permalink text,
  thumbnail text,
  seller_id bigint,
  available_quantity integer,
  sold_quantity integer,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE mercadolibre_items IS 'Cache local de publicaciones de Mercado Libre (items).';

CREATE TABLE IF NOT EXISTS mercadolibre_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id text NOT NULL,
  variation_id text NOT NULL,
  product_id uuid NULL REFERENCES products(id) ON DELETE SET NULL,
  seller_custom_field text,
  available_quantity integer,
  sold_quantity integer,
  attributes jsonb,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (variation_id)
);

COMMENT ON TABLE mercadolibre_variants IS 'Variaciones de publicaciones de ML. product_id es opcional y nunca se sobreescribe automáticamente.';

CREATE INDEX IF NOT EXISTS mercadolibre_variants_item_id_idx ON mercadolibre_variants(item_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mercadolibre_variants_item_id_fkey'
  ) THEN
    ALTER TABLE mercadolibre_variants
      ADD CONSTRAINT mercadolibre_variants_item_id_fkey
      FOREIGN KEY (item_id) REFERENCES mercadolibre_items(item_id) ON DELETE CASCADE;
  END IF;
END $$;

