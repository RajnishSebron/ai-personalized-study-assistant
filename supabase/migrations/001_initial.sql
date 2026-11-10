-- StudyPilot initial schema. Run once in Supabase SQL Editor on a new project.
create extension if not exists vector with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,full_name,email) values(new.id,new.raw_user_meta_data->>'full_name',new.email) on conflict(id) do update set email=excluded.email; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table if not exists public.materials (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null, file_name text not null, file_type text not null check(file_type in ('pdf','txt','md')),
 category text not null default 'notes' check(category in ('syllabus','notes','past_paper')),
 storage_path text, processing_status text not null default 'uploaded', total_pages int default 0,
 total_chunks int default 0, indexed_chunks int default 0, last_error text, uploaded_at timestamptz not null default now()
);
create table if not exists public.document_chunks (
 id uuid primary key default gen_random_uuid(), material_id uuid not null references public.materials(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, chunk_index int not null, content text not null,
 page_number int, section_heading text, embedding extensions.vector(768), created_at timestamptz not null default now(),
 unique(material_id,chunk_index)
);
create index if not exists document_chunks_user_material_idx on public.document_chunks(user_id,material_id);
create index if not exists document_chunks_embedding_idx on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);

create table if not exists public.topics (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 material_id uuid not null references public.materials(id) on delete cascade,
 parent_topic_id uuid references public.topics(id) on delete set null, topic_name text not null, description text, created_at timestamptz not null default now()
);
create table if not exists public.quiz_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 material_id uuid references public.materials(id) on delete set null, total_questions int not null,
 correct_answers int not null default 0, percentage numeric not null default 0,
 status text not null default 'in_progress' check(status in ('in_progress','completed')),
 completed_at timestamptz, created_at timestamptz not null default now()
);
-- Answer keys are deliberately protected: no authenticated-user SELECT policy is created.
create table if not exists public.quiz_questions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 attempt_id uuid not null references public.quiz_attempts(id) on delete cascade, question text not null,
 options jsonb not null, correct_answer text not null, explanation text, option_explanations jsonb,
 topic_name text, difficulty text, source_chunk_ids uuid[] not null, citations jsonb not null default '[]', created_at timestamptz not null default now()
);
create table if not exists public.quiz_responses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
 topic_id uuid references public.topics(id) on delete set null, topic_name text not null,
  question_id uuid REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
 selected_answer text, correct_answer text not null, is_correct boolean not null, feedback text,
 source_chunk_ids uuid[] default '{}', source_citations jsonb default '[]', created_at timestamptz not null default now()
);
create table if not exists public.revision_plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 available_minutes_per_day int not null, target_date date, created_at timestamptz not null default now()
);
create table if not exists public.revision_plan_items (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.revision_plans(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, topic_id uuid references public.topics(id) on delete set null,
 topic_name text not null, planned_minutes int not null, priority int not null, activity text not null,
 completion_status text not null default 'pending', scheduled_date date, created_at timestamptz not null default now()
);
create table if not exists public.chat_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text, created_at timestamptz not null default now()
);
create table if not exists public.chat_messages (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.chat_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('user','assistant')), content text not null, citations jsonb default '[]', created_at timestamptz not null default now()
);

-- RLS policy: profiles is keyed by id; all other student tables use user_id.
alter table public.profiles enable row level security;
drop policy if exists profiles_owner_all on public.profiles;
create policy profiles_owner_all on public.profiles for all to authenticated using(auth.uid()=id) with check(auth.uid()=id);

do $$ declare t text; begin
 foreach t in array array['materials','document_chunks','topics','quiz_attempts','quiz_responses','revision_plans','revision_plan_items','chat_sessions','chat_messages'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists owner_all on public.%I',t);
  execute format('create policy owner_all on public.%I for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id)',t);
 end loop;
end $$;
-- Intentionally no authenticated policy on quiz_questions. Server-only service role accesses answer keys.
alter table public.quiz_questions enable row level security;

create or replace function public.match_document_chunks(
 query_embedding extensions.vector(768), match_count int default 5, filter_material_ids uuid[] default null
) returns table(id uuid, content text, page_number int, section_heading text, material_id uuid, similarity float, document_title text)
language sql stable security invoker set search_path=public,extensions as $$
 select c.id,c.content,c.page_number,c.section_heading,c.material_id,
  1-(c.embedding <=> query_embedding) as similarity,m.title as document_title
 from public.document_chunks c join public.materials m on m.id=c.material_id
 where c.user_id=auth.uid() and c.embedding is not null
 and (filter_material_ids is null or c.material_id=any(filter_material_ids))
 order by c.embedding <=> query_embedding limit greatest(1,least(match_count,25));
$$;
revoke all on function public.match_document_chunks(extensions.vector, int, uuid[]) from public;
grant execute on function public.match_document_chunks(extensions.vector, int, uuid[]) to authenticated;

drop view if exists public.topic_performance;
create view public.topic_performance with (security_invoker=true) as
select t.user_id,t.id as topic_id,t.topic_name,count(r.id)::int as attempted,
 coalesce(round(100.0*count(*) filter(where r.is_correct)/nullif(count(r.id),0)),0)::int as accuracy,
 case when count(r.id)=0 then 'Not Assessed'
      when 100.0*count(*) filter(where r.is_correct)/count(r.id)<50 then 'Weak'
      when 100.0*count(*) filter(where r.is_correct)/count(r.id)<80 then 'Medium'
      else 'Strong' end as level
from public.topics t left join public.quiz_responses r on r.topic_id=t.id and r.user_id=auth.uid()
where t.user_id=auth.uid() group by t.user_id,t.id,t.topic_name;
grant select on public.topic_performance to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('study-materials','study-materials',false,10485760,array['application/pdf','text/plain','text/markdown'])
on conflict(id) do update set public=false,file_size_limit=10485760;
drop policy if exists students_upload_own_materials on storage.objects;
drop policy if exists students_read_own_materials on storage.objects;
drop policy if exists students_delete_own_materials on storage.objects;
create policy students_upload_own_materials on storage.objects for insert to authenticated with check(bucket_id='study-materials' and (storage.foldername(name))[1]=auth.uid()::text);
create policy students_read_own_materials on storage.objects for select to authenticated using(bucket_id='study-materials' and (storage.foldername(name))[1]=auth.uid()::text);
create policy students_delete_own_materials on storage.objects for delete to authenticated using(bucket_id='study-materials' and (storage.foldername(name))[1]=auth.uid()::text);
