-- Persistent call rooms: calls + call_members (mesh group & dm calls)

CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'group',
  peer_id UUID,
  created_by UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  with_video BOOLEAN NOT NULL DEFAULT false,
  ringtone TEXT NOT NULL DEFAULT 'classic',
  status TEXT NOT NULL DEFAULT 'ringing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE TABLE public.call_members (
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  state TEXT NOT NULL DEFAULT 'invited',
  joined_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (call_id, user_id)
);

CREATE INDEX call_members_user_id_idx ON public.call_members (user_id);
CREATE INDEX calls_status_idx ON public.calls (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calls_select_member" ON public.calls FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.call_members m
      WHERE m.call_id = calls.id AND m.user_id = auth.uid()
    )
  );
CREATE POLICY "calls_insert_own" ON public.calls FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "calls_update_member" ON public.calls FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.call_members m
      WHERE m.call_id = calls.id AND m.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.call_members TO authenticated;
GRANT ALL ON public.call_members TO service_role;
ALTER TABLE public.call_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_members_select_related" ON public.call_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_members.call_id AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.call_members m
      WHERE m.call_id = call_members.call_id AND m.user_id = auth.uid()
    )
  );
CREATE POLICY "call_members_insert_related" ON public.call_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_members.call_id AND c.created_by = auth.uid()
    )
  );
CREATE POLICY "call_members_update_related" ON public.call_members FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_members.call_id AND c.created_by = auth.uid()
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_members;
  END IF;
END
$$;
