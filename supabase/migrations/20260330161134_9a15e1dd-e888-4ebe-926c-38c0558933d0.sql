-- Add admin SELECT policies to tables missing them
CREATE POLICY "Admin can view all services" ON public.services
FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can view all blocks" ON public.schedule_blocks
FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can view all working_hours" ON public.working_hours
FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can view all ai_settings" ON public.ai_settings
FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can view all conversations" ON public.whatsapp_conversations
FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can view all studio_manicures" ON public.studio_manicures
FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));