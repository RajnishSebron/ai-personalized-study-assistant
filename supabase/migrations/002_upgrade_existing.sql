-- Upgrade an existing early StudyPilot database to the refreshed schema.
-- Run after the previous starter migration. Review before applying to customized databases.
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'notes';
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS total_pages int DEFAULT 0;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS total_chunks int DEFAULT 0;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS indexed_chunks int DEFAULT 0;
ALTER TABLE public.materials ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.document_chunks ALTER COLUMN embedding DROP NOT NULL;
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS completed_at timestamptz DEFAULT now();
ALTER TABLE public.quiz_responses ADD COLUMN IF NOT EXISTS topic_name text;
ALTER TABLE public.quiz_responses ADD COLUMN IF NOT EXISTS source_citations jsonb DEFAULT '[]';
ALTER TABLE public.quiz_responses ADD COLUMN IF NOT EXISTS source_chunk_ids uuid[] DEFAULT '{}';
CREATE TABLE IF NOT EXISTS public.quiz_questions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 attempt_id uuid not null references public.quiz_attempts(id) on delete cascade, question text not null,
 options jsonb not null, correct_answer text not null, explanation text, option_explanations jsonb,
 topic_name text, difficulty text, source_chunk_ids uuid[] not null, citations jsonb not null default '[]', created_at timestamptz not null default now()
);
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_all ON public.profiles;
DROP POLICY IF EXISTS profiles_owner_all ON public.profiles;
CREATE POLICY profiles_owner_all ON public.profiles FOR ALL TO authenticated USING(auth.uid()=id) WITH CHECK(auth.uid()=id);
DROP VIEW IF EXISTS public.topic_performance;
CREATE VIEW public.topic_performance WITH (security_invoker=true) AS
SELECT t.user_id,t.id AS topic_id,t.topic_name,count(r.id)::int AS attempted,
 coalesce(round(100.0*count(*) FILTER(where r.is_correct)/nullif(count(r.id),0)),0)::int AS accuracy,
 CASE WHEN count(r.id)=0 THEN 'Not Assessed'
 WHEN 100.0*count(*) FILTER(where r.is_correct)/count(r.id)<50 THEN 'Weak'
 WHEN 100.0*count(*) FILTER(where r.is_correct)/count(r.id)<80 THEN 'Medium' ELSE 'Strong' END AS level
FROM public.topics t LEFT JOIN public.quiz_responses r ON r.topic_id=t.id AND r.user_id=auth.uid()
WHERE t.user_id=auth.uid() GROUP BY t.user_id,t.id,t.topic_name;
GRANT SELECT ON public.topic_performance TO authenticated;


-- Rebuild owner policies for all user-owned tables. Profiles has its own key column.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['materials','document_chunks','topics','quiz_attempts','quiz_responses','revision_plans','revision_plan_items','chat_sessions','chat_messages'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS owner_all ON public.%I',t);
  EXECUTE format('CREATE POLICY owner_all ON public.%I FOR ALL TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id)',t);
 END LOOP;
END $$;

-- Replace the earlier RPC return shape (which used a JSON materials column)
-- with the refreshed document_title column expected by the current RAG service.
DROP FUNCTION IF EXISTS public.match_document_chunks(extensions.vector, integer, uuid[]);
CREATE FUNCTION public.match_document_chunks(
 query_embedding extensions.vector(768), match_count int DEFAULT 5, filter_material_ids uuid[] DEFAULT NULL
) RETURNS TABLE(id uuid, content text, page_number int, section_heading text, material_id uuid, similarity float, document_title text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,extensions AS $$
 SELECT c.id,c.content,c.page_number,c.section_heading,c.material_id,
  1-(c.embedding <=> query_embedding) AS similarity,m.title AS document_title
 FROM public.document_chunks c JOIN public.materials m ON m.id=c.material_id
 WHERE c.user_id=auth.uid() AND c.embedding IS NOT NULL
 AND (filter_material_ids IS NULL OR c.material_id=ANY(filter_material_ids))
 ORDER BY c.embedding <=> query_embedding LIMIT greatest(1,least(match_count,25));
$$;
REVOKE ALL ON FUNCTION public.match_document_chunks(extensions.vector, int, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_document_chunks(extensions.vector, int, uuid[]) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('study-materials','study-materials',false,10485760,array['application/pdf','text/plain','text/markdown'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=10485760;
DROP POLICY IF EXISTS students_upload_own_materials ON storage.objects;
DROP POLICY IF EXISTS students_read_own_materials ON storage.objects;
DROP POLICY IF EXISTS students_delete_own_materials ON storage.objects;
CREATE POLICY students_upload_own_materials ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='study-materials' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY students_read_own_materials ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='study-materials' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY students_delete_own_materials ON storage.objects FOR DELETE TO authenticated
USING(bucket_id='study-materials' AND (storage.foldername(name))[1]=auth.uid()::text);
