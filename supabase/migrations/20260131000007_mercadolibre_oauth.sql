-- Tabla para guardar credenciales OAuth de Mercado Libre (una sola conexión por app).
-- access_token, refresh_token, expires_at, user_id (seller_id de ML).

CREATE TABLE IF NOT EXISTS mercadolibre_oauth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  user_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE mercadolibre_oauth IS 'Credenciales OAuth de Mercado Libre (access_token, refresh_token, user_id). Una fila activa.';
