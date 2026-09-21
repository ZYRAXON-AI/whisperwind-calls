-- Friendships
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint friendships_pair_unique unique (requester_id, addressee_id),
  constraint friendships_not_self check (requester_id <> addressee_id),
  constraint friendships_status_valid check (status in ('pending','accepted'))
);

grant select, insert, update, delete on public.friendships to authenticated;
grant all on public.friendships to service_role;

alter table public.friendships enable row level security;

create policy friendships_select_own on public.friendships
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy friendships_insert_own on public.friendships
  for insert to authenticated
  with check (auth.uid() = requester_id);

create policy friendships_update_addressee on public.friendships
  for update to authenticated
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

create policy friendships_delete_own on public.friendships
  for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Private messages + editing
alter table public.messages
  add column if not exists recipient_id uuid references auth.users(id) on delete cascade,
  add column if not exists edited_at timestamptz;

drop policy if exists messages_read_all on public.messages;

create policy messages_read_visible on public.messages
  for select to authenticated
  using (
    recipient_id is null
    or auth.uid() = sender_id
    or auth.uid() = recipient_id
  );

create policy messages_update_own on public.messages
  for update to authenticated
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

create index if not exists messages_pair_idx on public.messages (sender_id, recipient_id, created_at desc);

alter table public.messages replica identity full;
alter publication supabase_realtime add table public.friendships;