-- Add date-specific working hour overrides and allow studio owners to manage staff schedules.

CREATE OR REPLACE FUNCTION public.can_manage_user_schedule(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() = target_user_id
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.profiles owner_profile
      JOIN public.studio_manicures sm
        ON sm.studio_profile_id = owner_profile.id
      WHERE owner_profile.user_id = auth.uid()
        AND owner_profile.account_type = 'studio'
        AND sm.manicure_user_id = target_user_id
        AND sm.is_active = true
    )
$$;

DROP POLICY IF EXISTS "Owner can manage working hours" ON public.working_hours;

CREATE POLICY "Users can manage working hours" ON public.working_hours
FOR ALL TO authenticated
USING (public.can_manage_user_schedule(user_id))
WITH CHECK (public.can_manage_user_schedule(user_id));

CREATE TABLE IF NOT EXISTS public.working_hours_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT true,
    open_time TIME NOT NULL DEFAULT '08:00',
    close_time TIME NOT NULL DEFAULT '18:00',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, work_date)
);

ALTER TABLE public.working_hours_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage working hour overrides" ON public.working_hours_overrides
FOR ALL TO authenticated
USING (public.can_manage_user_schedule(user_id))
WITH CHECK (public.can_manage_user_schedule(user_id));

CREATE POLICY "Admin can view all working hour overrides" ON public.working_hours_overrides
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_working_hours_overrides_updated_at
BEFORE UPDATE ON public.working_hours_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();