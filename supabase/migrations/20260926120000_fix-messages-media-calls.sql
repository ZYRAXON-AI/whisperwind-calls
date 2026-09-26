-- 2026-09-26: fix group room messages, media bucket, and single-active-call rules.

-- 1) The "media" storage bucket referenced by src/lib/media.ts was never created.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, null, null)
on conflict (id) do nothing;

-- 2) messages.recipient_id was uuid, but group rooms use room keys like 'zyraxon-ai'.
alter table public.messages
  drop constraint if exists messages_recipient_id_fkey;

alter table public.messages
  alter column recipient_id type text using recipient_id::text;

-- 3) RLS read policy: allow room-key recipients (group chat) and text id comparison.
drop policy if exists messages_read_visible on public.messages;
create policy messages_read_visible on public.messages
  for select to authenticated
  using (
    recipient_id is null
    or auth.uid()::text = recipient_id
    or auth.uid() = sender_id
    or recipient_id = 'zyraxon-ai'
  );

-- 4) Only one active call per DM pair and one group call at a time.
--    Expr index uses the ordered (creator, peer) pair so A→B and B→A collide.
--    End any pre-existing duplicates first so the index can be created safely.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT kind, created_by, peer_id, id, created_at,
           row_number() OVER (
             PARTITION BY kind, least(created_by, peer_id), greatest(created_by, peer_id)
             ORDER BY created_at DESC
           ) AS rn
    FROM public.calls
    WHERE status <> 'ended' AND kind = 'dm' AND peer_id IS NOT NULL
  LOOP
    IF r.rn > 1 THEN
      UPDATE public.calls SET status = 'ended', ended_at = now() WHERE id = r.id;
    END IF;
  END LOOP;

  FOR r IN
    SELECT id, created_at,
           row_number() OVER (ORDER BY created_at DESC) AS rn
    FROM public.calls
    WHERE status <> 'ended' AND kind = 'group'
  LOOP
    IF r.rn > 1 THEN
      UPDATE public.calls SET status = 'ended', ended_at = now() WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

create unique index if not exists calls_one_active_dm
  on public.calls (kind, least(created_by, peer_id), greatest(created_by, peer_id))
  where status <> 'ended' and kind = 'dm' and peer_id is not null;

create unique index if not exists calls_one_active_group
  on public.calls (kind)
  where status <> 'ended' and kind = 'group';