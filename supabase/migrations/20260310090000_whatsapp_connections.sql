-- WhatsApp channels config (Evolution API)
CREATE TABLE IF NOT EXISTS public.organization_whatsapp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'evolution',
  connection_name TEXT NOT NULL DEFAULT 'Conexao WhatsApp',
  instance_url TEXT,
  instance_name TEXT,
  api_key TEXT,
  typing_enabled BOOLEAN NOT NULL DEFAULT false,
  typing_interval_min_seconds INTEGER NOT NULL DEFAULT 0,
  typing_interval_max_seconds INTEGER NOT NULL DEFAULT 2,
  listen_groups BOOLEAN NOT NULL DEFAULT false,
  list_type TEXT NOT NULL DEFAULT 'buttons',
  restore_enabled BOOLEAN NOT NULL DEFAULT false,
  restore_from DATE,
  restore_to DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT organization_whatsapp_connections_org_provider_unique UNIQUE (organization_id, provider),
  CONSTRAINT organization_whatsapp_connections_list_type_chk CHECK (list_type IN ('buttons', 'numeric')),
  CONSTRAINT organization_whatsapp_connections_typing_min_chk CHECK (typing_interval_min_seconds >= 0),
  CONSTRAINT organization_whatsapp_connections_typing_max_chk CHECK (typing_interval_max_seconds >= typing_interval_min_seconds)
);

ALTER TABLE public.organization_whatsapp_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage whatsapp connections" ON public.organization_whatsapp_connections;
CREATE POLICY "Admins can manage whatsapp connections"
  ON public.organization_whatsapp_connections
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND organization_id = organization_whatsapp_connections.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND organization_id = organization_whatsapp_connections.organization_id
    )
  );

DROP POLICY IF EXISTS "Members can view whatsapp connections" ON public.organization_whatsapp_connections;
CREATE POLICY "Members can view whatsapp connections"
  ON public.organization_whatsapp_connections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND organization_id = organization_whatsapp_connections.organization_id
    )
  );