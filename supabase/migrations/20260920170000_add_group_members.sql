CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT ON public.group_members TO authenticated;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_members_read_all" ON public.group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "group_members_insert_own" ON public.group_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
