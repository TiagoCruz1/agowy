-- Allow studio owners to read/manage appointments from linked active staff accounts.

CREATE OR REPLACE FUNCTION public.can_manage_user_appointments(target_user_id uuid)
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

DROP POLICY IF EXISTS "Owner can manage appointments" ON public.appointments;

CREATE POLICY "Users can manage appointments" ON public.appointments
FOR ALL TO authenticated
USING (public.can_manage_user_appointments(user_id))
WITH CHECK (public.can_manage_user_appointments(user_id));
