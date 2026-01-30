-- Ejecutar en Supabase SQL Editor si la tabla external_variants no existe.
-- Soluciona: "Could not find the table 'public.external_variants' in the schema cache"

CREATE TABLE IF NOT EXISTS external_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  platform text NOT NULL,
  external_item_id text NOT NULL,
  external_variation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_variation_id),
  UNIQUE (product_id, platform)
);

CREATE INDEX IF NOT EXISTS external_variants_product_id_idx ON external_variants(product_id);
CREATE INDEX IF NOT EXISTS external_variants_platform_variation_idx ON external_variants(platform, external_variation_id);

COMMENT ON TABLE external_variants IS 'Vinculación 1:1 entre producto local y variante en plataforma externa (ej. Mercado Libre).';
