-- Owner-only retrieval for internal TCS READMEGPT knowledge.
-- The public RPC remains restricted to public documents. This RPC requires the
-- server-only Owner authentication key and is called only after Owner session validation.

create or replace function private._tcs_owner_search_knowledge(p_query text, p_app_code text, p_limit integer, p_server_key text)
returns table(document_id uuid, app_code text, app_name text, document_type text, title text, content text, source_repo_path text, rank real)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not private._tcs_owner_check_server_key(p_server_key) then return; end if;
  if p_query is null or pg_catalog.btrim(p_query) = '' then return; end if;
  return query
    select d.id, a.app_code, a.app_name, d.document_type, d.title,
           pg_catalog.left(d.content, 2200), d.source_repo_path,
           pg_catalog.ts_rank(d.search_vector, pg_catalog.websearch_to_tsquery('simple', pg_catalog.left(p_query, 500)))::real
    from public.tcs_knowledge_documents d
    join public.tcs_app_registry a on a.id = d.app_id
    where d.visibility = 'internal'
      and (p_app_code is null or a.app_code = p_app_code)
      and d.search_vector @@ pg_catalog.websearch_to_tsquery('simple', pg_catalog.left(p_query, 500))
    order by 8 desc, d.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 3), 5));
end;
$function$;

create or replace function public.tcs_owner_search_knowledge(p_query text, p_app_code text default null, p_limit integer default 3, p_server_key text default null)
returns table(document_id uuid, app_code text, app_name text, document_type text, title text, content text, source_repo_path text, rank real)
language sql
security invoker
set search_path to ''
as $function$
  select * from private._tcs_owner_search_knowledge(p_query, p_app_code, p_limit, p_server_key);
$function$;

revoke all on function private._tcs_owner_search_knowledge(text, text, integer, text) from public;
grant execute on function private._tcs_owner_search_knowledge(text, text, integer, text) to anon, authenticated, service_role;
revoke all on function public.tcs_owner_search_knowledge(text, text, integer, text) from public;
grant execute on function public.tcs_owner_search_knowledge(text, text, integer, text) to anon, authenticated, service_role;
