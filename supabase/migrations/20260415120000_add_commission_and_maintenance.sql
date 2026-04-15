-- Comissão e manutenção nos serviços
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS commission_percentage DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS maintenance_alert_days INTEGER DEFAULT 15;

-- Tabela de alertas de manutenção
CREATE TABLE IF NOT EXISTS public.maintenance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  last_notified_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  dismissed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenance_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage maintenance alerts" ON public.maintenance_alerts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_maintenance_alerts_updated_at
  BEFORE UPDATE ON public.maintenance_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de recibos
CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  manicure_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  digital_signature_at TIMESTAMPTZ,
  manual_signature_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.payment_receipts(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  service_value DECIMAL(10,2) NOT NULL,
  commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  commission_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Studio owner can manage receipts" ON public.payment_receipts
  FOR ALL TO authenticated
  USING (auth.uid() = studio_user_id OR auth.uid() = manicure_user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Receipt items follow receipt" ON public.payment_receipt_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payment_receipts r
      WHERE r.id = receipt_id
      AND (auth.uid() = r.studio_user_id OR auth.uid() = r.manicure_user_id OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE TRIGGER update_payment_receipts_updated_at
  BEFORE UPDATE ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
