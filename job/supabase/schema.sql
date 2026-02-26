-- CurranteYA schema (single profiles table for both roles)
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('worker', 'company')),
  name text not null,
  city text not null,
  phone text,
  categories text[] default '{}'::text[],
  experience text,
  available_today boolean not null default false,
  radius_km integer not null default 10 check (radius_km between 1 and 100),
  photo_url text,
  company_name text,
  contact_name text,
  cif text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  category text not null,
  city text not null,
  description text not null,
  schedule text not null check (schedule in ('parcial', 'completa')),
  salary_text text not null,
  start_date date,
  urgent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'applied' check (status in ('applied', 'shortlisted', 'rejected', 'hired')),
  created_at timestamptz not null default now(),
  unique (job_id, worker_id)
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  company_id uuid not null references public.profiles (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  application_id uuid not null unique references public.applications (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_role_available_city
  on public.profiles (role, available_today, city);
create index if not exists idx_jobs_city_category_urgent
  on public.jobs (city, category, urgent, created_at desc);
create index if not exists idx_applications_job_id
  on public.applications (job_id);
create index if not exists idx_applications_worker_id
  on public.applications (worker_id);
create index if not exists idx_messages_chat_created
  on public.messages (chat_id, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'role', 'worker');
  v_name text := coalesce(new.raw_user_meta_data ->> 'name', 'Nuevo usuario');
  v_city text := coalesce(new.raw_user_meta_data ->> 'city', 'Sin ciudad');
begin
  if v_role not in ('worker', 'company') then
    v_role := 'worker';
  end if;

  insert into public.profiles (
    id,
    role,
    name,
    city,
    company_name,
    contact_name
  )
  values (
    new.id,
    v_role,
    v_name,
    v_city,
    case when v_role = 'company' then v_name else null end,
    case when v_role = 'company' then v_name else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

drop policy if exists profiles_select_available_workers_for_companies on public.profiles;
create policy profiles_select_available_workers_for_companies
on public.profiles
for select
to authenticated
using (
  role = 'worker'
  and available_today = true
  and exists (
    select 1
    from public.profiles me
    where me.id = auth.uid()
      and me.role = 'company'
  )
);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists jobs_select_authenticated on public.jobs;
create policy jobs_select_authenticated
on public.jobs
for select
to authenticated
using (true);

drop policy if exists jobs_insert_company_owner on public.jobs;
create policy jobs_insert_company_owner
on public.jobs
for insert
to authenticated
with check (
  company_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'company'
  )
);

drop policy if exists jobs_update_company_owner on public.jobs;
create policy jobs_update_company_owner
on public.jobs
for update
to authenticated
using (company_id = auth.uid())
with check (company_id = auth.uid());

drop policy if exists jobs_delete_company_owner on public.jobs;
create policy jobs_delete_company_owner
on public.jobs
for delete
to authenticated
using (company_id = auth.uid());

drop policy if exists applications_select_owner_or_job_company on public.applications;
create policy applications_select_owner_or_job_company
on public.applications
for select
to authenticated
using (
  worker_id = auth.uid()
  or exists (
    select 1
    from public.jobs j
    where j.id = applications.job_id
      and j.company_id = auth.uid()
  )
);

drop policy if exists applications_insert_worker_self on public.applications;
create policy applications_insert_worker_self
on public.applications
for insert
to authenticated
with check (
  worker_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'worker'
  )
);

drop policy if exists applications_update_company_on_own_job on public.applications;
create policy applications_update_company_on_own_job
on public.applications
for update
to authenticated
using (
  exists (
    select 1
    from public.jobs j
    where j.id = applications.job_id
      and j.company_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.jobs j
    where j.id = applications.job_id
      and j.company_id = auth.uid()
  )
);

drop policy if exists chats_select_participants on public.chats;
create policy chats_select_participants
on public.chats
for select
to authenticated
using (company_id = auth.uid() or worker_id = auth.uid());

drop policy if exists chats_insert_participants on public.chats;
create policy chats_insert_participants
on public.chats
for insert
to authenticated
with check (
  (company_id = auth.uid() or worker_id = auth.uid())
  and exists (
    select 1
    from public.applications a
    join public.jobs j on j.id = a.job_id
    where a.id = chats.application_id
      and a.job_id = chats.job_id
      and a.worker_id = chats.worker_id
      and j.company_id = chats.company_id
  )
);

drop policy if exists messages_select_chat_participants on public.messages;
create policy messages_select_chat_participants
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.chats c
    where c.id = messages.chat_id
      and (c.company_id = auth.uid() or c.worker_id = auth.uid())
  )
);

drop policy if exists messages_insert_chat_participants on public.messages;
create policy messages_insert_chat_participants
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.chats c
    where c.id = messages.chat_id
      and (c.company_id = auth.uid() or c.worker_id = auth.uid())
  )
);

insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do nothing;

drop policy if exists profile_media_read_authenticated on storage.objects;
create policy profile_media_read_authenticated
on storage.objects
for select
to authenticated
using (bucket_id = 'profile-media');

drop policy if exists profile_media_insert_own_folder on storage.objects;
create policy profile_media_insert_own_folder
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists profile_media_update_own_folder on storage.objects;
create policy profile_media_update_own_folder
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists profile_media_delete_own_folder on storage.objects;
create policy profile_media_delete_own_folder
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
