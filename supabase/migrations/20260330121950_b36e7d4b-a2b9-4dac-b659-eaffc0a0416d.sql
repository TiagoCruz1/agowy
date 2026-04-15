
-- 1. Account type enum
CREATE TYPE public.account_type AS ENUM ('solo', 'studio');

-- 2. Add account_type and studio_id to profiles
ALTER TABLE public.profiles 
  ADD COLUMN account_type public.account_type NOT NULL DEFAULT 'solo',
  ADD COLUMN studio_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. User roles table (admin, etc.)
CREATE TYPE public.app_role AS ENUM ('admin', 'studio_owner', 'manicure', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS for user_roles: users can see their own roles, admins can see all
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. Add maintenance_interval_days to services
ALTER TABLE public.services 
  ADD COLUMN maintenance_interval_days integer DEFAULT 21;

-- 5. Add manicure_id to appointments (for studios)
ALTER TABLE public.appointments 
  ADD COLUMN manicure_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 6. Reviews table
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  manicure_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage reviews" ON public.reviews
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- 7. Add AI control fields to whatsapp_conversations
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN ai_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN human_takeover boolean NOT NULL DEFAULT false,
  ADD COLUMN human_takeover_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 8. Studio manicures table (link manicures to studios)
CREATE TABLE public.studio_manicures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  manicure_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_profile_id, manicure_user_id)
);

ALTER TABLE public.studio_manicures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Studio owner can manage manicures" ON public.studio_manicures
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = studio_profile_id AND user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Manicures can view own link" ON public.studio_manicures
  FOR SELECT TO authenticated
  USING (manicure_user_id = auth.uid());

-- 9. AI settings per user
CREATE TABLE public.ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  ai_globally_enabled boolean NOT NULL DEFAULT true,
  reminder_hours_before integer NOT NULL DEFAULT 5,
  greeting_message text DEFAULT 'Olá! 👋 Sou a assistente virtual. Como posso ajudar? Você pode agendar um horário ou falar diretamente com a manicure.',
  offer_human_option boolean NOT NULL DEFAULT true,
  end_service_keyword text NOT NULL DEFAULT 'Atendimento encerrado',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage ai settings" ON public.ai_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- Trigger for updated_at on new tables
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_settings_updated_at BEFORE UPDATE ON public.ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_studio_manicures_updated_at BEFORE UPDATE ON public.studio_manicures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
