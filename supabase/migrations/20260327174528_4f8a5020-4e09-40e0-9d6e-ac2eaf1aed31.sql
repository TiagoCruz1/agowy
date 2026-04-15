
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================================================
-- PROFILES (manicure owner)
-- =============================================================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    business_name TEXT DEFAULT 'Meu Estúdio de Nail',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'Manicure'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- SERVICES
-- =============================================================================
CREATE TABLE public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage services" ON public.services FOR ALL USING (auth.uid() = user_id);
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- CLIENTS
-- =============================================================================
CREATE TABLE public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    date_of_birth DATE,
    address_street TEXT,
    address_number TEXT,
    address_neighborhood TEXT,
    address_city TEXT,
    address_state TEXT,
    address_zip TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage clients" ON public.clients FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_clients_phone ON public.clients(phone);
CREATE INDEX idx_clients_name ON public.clients(full_name);
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- WORKING HOURS
-- =============================================================================
CREATE TABLE public.working_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    is_open BOOLEAN NOT NULL DEFAULT true,
    open_time TIME NOT NULL DEFAULT '08:00',
    close_time TIME NOT NULL DEFAULT '18:00',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, day_of_week)
);

ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage working hours" ON public.working_hours FOR ALL USING (auth.uid() = user_id);
CREATE TRIGGER update_working_hours_updated_at BEFORE UPDATE ON public.working_hours FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- SCHEDULE BLOCKS
-- =============================================================================
CREATE TABLE public.schedule_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    reason TEXT,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage blocks" ON public.schedule_blocks FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_blocks_dates ON public.schedule_blocks(start_at, end_at);
CREATE TRIGGER update_schedule_blocks_updated_at BEFORE UPDATE ON public.schedule_blocks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- APPOINTMENTS
-- =============================================================================
CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
CREATE TYPE public.appointment_source AS ENUM ('manual', 'whatsapp', 'instagram');

CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status public.appointment_status NOT NULL DEFAULT 'scheduled',
    source public.appointment_source NOT NULL DEFAULT 'manual',
    notes TEXT,
    price DECIMAL(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage appointments" ON public.appointments FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_appointments_dates ON public.appointments(start_at, end_at);
CREATE INDEX idx_appointments_client ON public.appointments(client_id);
CREATE INDEX idx_appointments_status ON public.appointments(status);
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- WHATSAPP CONVERSATIONS
-- =============================================================================
CREATE TABLE public.whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    state TEXT NOT NULL DEFAULT 'idle',
    state_data JSONB NOT NULL DEFAULT '{}',
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can manage conversations" ON public.whatsapp_conversations FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_conversations_phone ON public.whatsapp_conversations(phone);
CREATE TRIGGER update_whatsapp_conversations_updated_at BEFORE UPDATE ON public.whatsapp_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
