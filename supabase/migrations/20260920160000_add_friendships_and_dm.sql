-- Friend relationships
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "friendships_read_own" ON public.friendships FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "friendships_insert_own" ON public.friendships FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "friendships_update_own" ON public.friendships FOR UPDATE TO authenticated
  USING (auth.uid() = addressee_id) WITH CHECK (auth.uid() = addressee_id);
CREATE POLICY "friendships_delete_own" ON public.friendships FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- DM conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.conversations TO authenticated;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_participant_read" ON public.conversations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants WHERE conversation_id = id AND user_id = auth.uid()
  ));

-- Conversation participants
CREATE TABLE public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);
GRANT SELECT, INSERT ON public.conversation_participants TO authenticated;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants_read_own" ON public.conversation_participants FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "participants_insert_own" ON public.conversation_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- DM messages
CREATE TABLE public.dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  media_url TEXT,
  media_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_messages TO authenticated;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dm_read_participant" ON public.dm_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants WHERE conversation_id = dm_messages.conversation_id AND user_id = auth.uid()
  ));
CREATE POLICY "dm_insert_own" ON public.dm_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "dm_update_own" ON public.dm_messages FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "dm_delete_own" ON public.dm_messages FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

CREATE INDEX dm_messages_conversation_idx ON public.dm_messages (conversation_id, created_at);
CREATE INDEX friendships_requester_idx ON public.friendships (requester_id);
CREATE INDEX friendships_addressee_idx ON public.friendships (addressee_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
