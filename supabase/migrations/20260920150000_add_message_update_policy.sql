-- Allow users to update their own messages (for edit and delete-for-everyone)
CREATE POLICY "messages_update_own" ON public.messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);
