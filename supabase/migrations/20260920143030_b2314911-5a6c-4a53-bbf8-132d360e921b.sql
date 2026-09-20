CREATE POLICY "media_read_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'media');
CREATE POLICY "media_insert_auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media' AND owner = auth.uid());
CREATE POLICY "media_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'media' AND owner = auth.uid());