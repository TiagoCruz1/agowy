
-- Admin can view all profiles
CREATE POLICY "Admin can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin can view all clients
CREATE POLICY "Admin can view all clients" ON public.clients
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin can view all appointments
CREATE POLICY "Admin can view all appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin can view all reviews
CREATE POLICY "Admin can view all reviews" ON public.reviews
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
