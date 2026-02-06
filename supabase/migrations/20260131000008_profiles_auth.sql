-- Perfiles por usuario de Supabase Auth. Solo administradores pueden usar la app.
-- El primer usuario que se registre recibe rol 'admin'; el resto 'user'.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- El primer usuario que se crea en auth.users recibe rol admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (
    NEW.id,
    CASE WHEN (SELECT count(*) FROM public.profiles) = 0 THEN 'admin' ELSE 'user' END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS: cada usuario puede leer su propio perfil (para el cliente con sesión).
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

COMMENT ON TABLE public.profiles IS 'Rol por usuario (admin/user). Solo admin puede usar la app.';
