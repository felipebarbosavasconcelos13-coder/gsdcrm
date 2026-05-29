-- Tighten core RLS policies for multi-tenant isolation.
-- The baseline schema had several permissive authenticated policies used during
-- the single-tenant phase. These policies constrain access by organization_id.

CREATE OR REPLACE FUNCTION public.current_user_organization_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT p.organization_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id = org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.organization_id = org_id
      AND p.role = 'admin'
  )
$$;

REVOKE ALL ON FUNCTION public.current_user_organization_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_organization_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;

-- Organizations and profiles
DROP POLICY IF EXISTS "authenticated_access" ON public.organizations;
DROP POLICY IF EXISTS "organizations_select_members" ON public.organizations;
DROP POLICY IF EXISTS "organizations_insert_authenticated" ON public.organizations;
DROP POLICY IF EXISTS "organizations_update_admins" ON public.organizations;
DROP POLICY IF EXISTS "organizations_delete_admins" ON public.organizations;

CREATE POLICY "organizations_select_members"
  ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id));

CREATE POLICY "organizations_insert_authenticated"
  ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "organizations_update_admins"
  ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

CREATE POLICY "organizations_delete_admins"
  ON public.organizations
  FOR DELETE TO authenticated
  USING (public.is_org_admin(id));

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_same_org" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;

CREATE POLICY "profiles_select_same_org"
  ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_org_member(organization_id));

CREATE POLICY "profiles_insert_self"
  ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_self_or_admin"
  ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_org_admin(organization_id))
  WITH CHECK (id = auth.uid() OR public.is_org_admin(organization_id));

-- Global lifecycle stages are shared catalog data. Any authenticated user can
-- read them; only admins can change the shared catalog.
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.lifecycle_stages;
DROP POLICY IF EXISTS "lifecycle_stages_read_authenticated" ON public.lifecycle_stages;
DROP POLICY IF EXISTS "lifecycle_stages_admin_write" ON public.lifecycle_stages;

CREATE POLICY "lifecycle_stages_read_authenticated"
  ON public.lifecycle_stages
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "lifecycle_stages_admin_write"
  ON public.lifecycle_stages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Direct organization_id tables.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'crm_companies',
    'boards',
    'board_stages',
    'contacts',
    'products',
    'deals',
    'deal_items',
    'activities',
    'tags',
    'custom_field_definitions',
    'leads',
    'ai_prompt_templates',
    'ai_feature_flags'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "tenant_member_access" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.%I', tbl);

    EXECUTE format(
      'CREATE POLICY "tenant_member_access" ON public.%I FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id))',
      tbl
    );
  END LOOP;
END $$;

-- Tables whose tenant is inferred through a deal.
DROP POLICY IF EXISTS "deal_notes_access" ON public.deal_notes;
DROP POLICY IF EXISTS "deal_notes_tenant_access" ON public.deal_notes;
CREATE POLICY "deal_notes_tenant_access"
  ON public.deal_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_notes.deal_id
        AND public.is_org_member(d.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_notes.deal_id
        AND public.is_org_member(d.organization_id)
    )
  );

DROP POLICY IF EXISTS "deal_files_access" ON public.deal_files;
DROP POLICY IF EXISTS "deal_files_tenant_access" ON public.deal_files;
CREATE POLICY "deal_files_tenant_access"
  ON public.deal_files
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_files.deal_id
        AND public.is_org_member(d.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_files.deal_id
        AND public.is_org_member(d.organization_id)
    )
  );

-- User-scoped AI tables without organization_id.
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_conversations;
DROP POLICY IF EXISTS "ai_conversations_owner_access" ON public.ai_conversations;
CREATE POLICY "ai_conversations_owner_access"
  ON public.ai_conversations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_decisions;
DROP POLICY IF EXISTS "ai_decisions_member_access" ON public.ai_decisions;
CREATE POLICY "ai_decisions_member_access"
  ON public.ai_decisions
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = ai_decisions.deal_id
        AND public.is_org_member(d.organization_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = ai_decisions.deal_id
        AND public.is_org_member(d.organization_id)
    )
  );

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_audio_notes;
DROP POLICY IF EXISTS "ai_audio_notes_member_access" ON public.ai_audio_notes;
CREATE POLICY "ai_audio_notes_member_access"
  ON public.ai_audio_notes
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = ai_audio_notes.deal_id
        AND public.is_org_member(d.organization_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = ai_audio_notes.deal_id
        AND public.is_org_member(d.organization_id)
    )
  );

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.ai_suggestion_interactions;
DROP POLICY IF EXISTS "ai_suggestion_interactions_owner_access" ON public.ai_suggestion_interactions;
CREATE POLICY "ai_suggestion_interactions_owner_access"
  ON public.ai_suggestion_interactions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
