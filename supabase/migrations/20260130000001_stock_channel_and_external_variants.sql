-- Soporte multi-canal de stock y vinculación con plataformas externas (ej. Mercado Libre).
-- El stock sigue siendo solo por movimientos; no se cambia el modelo de products.

-- 1) Extender stock_movements con canal
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS channel text DEFAULT 'LOCAL';

UPDATE stock_movements SET channel = 'LOCAL' WHERE channel IS NULL;
ALTER TABLE stock_movements ALTER COLUMN channel SET NOT NULL;
ALTER TABLE stock_movements ALTER COLUMN channel SET DEFAULT 'LOCAL';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_channel_check') THEN
    ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_channel_check CHECK (channel IN ('LOCAL', 'MERCADOLIBRE'));
  END IF;
END $$;

-- reference_id ya existe y es opcional; puede usarse para order_id de ML u otras referencias.

-- 2) Tabla de vinculación producto <-> variante externa (ML, etc.)
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
COMMENT ON COLUMN stock_movements.channel IS 'Canal del movimiento: LOCAL o MERCADOLIBRE. Trazabilidad por canal.';
