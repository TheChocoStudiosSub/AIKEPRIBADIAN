-- Server-only per-request diagnostics for Choco AI.
-- Stores visitor/network/conversation linkage and delivery metadata, never full prompts or replies.
-- Raw IP addresses are restricted to the private schema and expire after 30 days.

create table if not exists private.tcs_chat_diagnostics (
  diagnostic_id uuid primary key,
  visitor_id uuid not null,
  conversation_id uuid not null,
  conversation_title text not null check (char_length(conversation_title) between 1 and 36),
  ip_address inet,
  user_agent text,
  request_mode text not null check (request_mode in ('stream', 'json')),
  model_name text,
  request_status text not null default 'processing'
    check (request_status in ('processing', 'completed', 'truncated', 'failed', 'cancelled')),
  http_status integer check (http_status between 100 and 599),
  upstream_status integer check (upstream_status between 100 and 599),
  finish_reason text,
  stream_done_received boolean,
  response_characters integer not null default 0 check (response_characters >= 0),
  response_bytes bigint not null default 0 check (response_bytes >= 0),
  error_code text,
  client_received_characters integer check (client_received_characters is null or client_received_characters >= 0),
  client_received_done boolean,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days')
);

alter table private.tcs_chat_diagnostics enable row level security;
create index if not exists idx_tcs_chat_diagnostics_created on private.tcs_chat_diagnostics (created_at desc);
create index if not exists idx_tcs_chat_diagnostics_visitor_created on private.tcs_chat_diagnostics (visitor_id, created_at desc);
create index if not exists idx_tcs_chat_diagnostics_conversation_created on private.tcs_chat_diagnostics (conversation_id, created_at desc);
create index if not exists idx_tcs_chat_diagnostics_ip_created on private.tcs_chat_diagnostics (ip_address, created_at desc);
create index if not exists idx_tcs_chat_diagnostics_expires on private.tcs_chat_diagnostics (expires_at);
revoke all on table private.tcs_chat_diagnostics from public, anon, authenticated, service_role;

comment on table private.tcs_chat_diagnostics is
  'Private Choco AI diagnostics. Contains raw client IP, anonymous visitor/conversation IDs, short conversation titles, and delivery telemetry. No full chat messages are stored. Records expire after 30 days.';

create or replace function private._tcs_chat_write_diagnostic(
  p_stage text, p_diagnostic_id uuid, p_visitor_id uuid, p_conversation_id uuid,
  p_conversation_title text, p_ip_address text, p_user_agent text, p_request_mode text,
  p_model_name text, p_request_status text, p_http_status integer, p_upstream_status integer,
  p_finish_reason text, p_stream_done_received boolean, p_response_characters integer,
  p_response_bytes bigint, p_error_code text, p_client_received_characters integer,
  p_client_received_done boolean, p_server_key text
)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_ip inet;
begin
  if coalesce(private._tcs_owner_check_server_key(p_server_key), false) is not true then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_stage not in ('start', 'finish', 'client_report')
     or p_diagnostic_id is null or p_visitor_id is null or p_conversation_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_arguments');
  end if;

  if p_stage = 'start' then
    if p_conversation_id is null or p_conversation_title is null or char_length(p_conversation_title) < 1
       or char_length(p_conversation_title) > 36 or p_request_mode is null
       or p_request_mode not in ('stream', 'json') then
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_start_arguments');
    end if;
    if p_ip_address is not null and p_ip_address <> '' then
      begin
        v_ip := p_ip_address::inet;
      exception when others then
        return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_ip_address');
      end;
    end if;

    delete from private.tcs_chat_diagnostics
    where diagnostic_id in (
      select diagnostic_id from private.tcs_chat_diagnostics
      where expires_at <= v_now order by expires_at limit 100
    );
    insert into private.tcs_chat_diagnostics (
      diagnostic_id, visitor_id, conversation_id, conversation_title, ip_address,
      user_agent, request_mode, model_name, request_status, created_at, expires_at
    ) values (
      p_diagnostic_id, p_visitor_id, p_conversation_id, p_conversation_title, v_ip,
      left(coalesce(p_user_agent, ''), 300), p_request_mode,
      left(coalesce(p_model_name, ''), 100), 'processing', v_now, v_now + interval '30 days'
    ) on conflict (diagnostic_id) do nothing;
    return pg_catalog.jsonb_build_object('ok', true, 'stage', 'start');
  end if;

  if p_stage = 'finish' then
    if p_conversation_id is null or p_request_status is null
       or p_request_status not in ('completed', 'truncated', 'failed', 'cancelled') then
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_request_status');
    end if;
    update private.tcs_chat_diagnostics
    set request_status = p_request_status,
        http_status = case when p_http_status between 100 and 599 then p_http_status else http_status end,
        upstream_status = case when p_upstream_status between 100 and 599 then p_upstream_status else upstream_status end,
        finish_reason = left(coalesce(p_finish_reason, finish_reason), 40),
        stream_done_received = coalesce(p_stream_done_received, stream_done_received),
        response_characters = greatest(0, coalesce(p_response_characters, response_characters)),
        response_bytes = greatest(0, coalesce(p_response_bytes, response_bytes)),
        error_code = left(coalesce(p_error_code, error_code), 80),
        completed_at = v_now
    where diagnostic_id = p_diagnostic_id and visitor_id = p_visitor_id;
    return pg_catalog.jsonb_build_object('ok', found, 'stage', 'finish');
  end if;

  update private.tcs_chat_diagnostics
  set client_received_characters = greatest(0, coalesce(p_client_received_characters, client_received_characters)),
      client_received_done = coalesce(p_client_received_done, client_received_done)
  where diagnostic_id = p_diagnostic_id and visitor_id = p_visitor_id;
  return pg_catalog.jsonb_build_object('ok', found, 'stage', 'client_report');
end;
$function$;

revoke all on function private._tcs_chat_write_diagnostic(
  text, uuid, uuid, uuid, text, text, text, text, text, text,
  integer, integer, text, boolean, integer, bigint, text, integer, boolean, text
) from public, anon, authenticated, service_role;

create or replace function public.tcs_chat_write_diagnostic(
  p_stage text, p_diagnostic_id uuid, p_visitor_id uuid, p_conversation_id uuid,
  p_conversation_title text, p_ip_address text, p_user_agent text, p_request_mode text,
  p_model_name text, p_request_status text, p_http_status integer, p_upstream_status integer,
  p_finish_reason text, p_stream_done_received boolean, p_response_characters integer,
  p_response_bytes bigint, p_error_code text, p_client_received_characters integer,
  p_client_received_done boolean, p_server_key text
)
returns jsonb language sql security definer set search_path to ''
as $function$
  select private._tcs_chat_write_diagnostic(
    p_stage, p_diagnostic_id, p_visitor_id, p_conversation_id, p_conversation_title,
    p_ip_address, p_user_agent, p_request_mode, p_model_name, p_request_status,
    p_http_status, p_upstream_status, p_finish_reason, p_stream_done_received,
    p_response_characters, p_response_bytes, p_error_code,
    p_client_received_characters, p_client_received_done, p_server_key
  );
$function$;

revoke all on function public.tcs_chat_write_diagnostic(
  text, uuid, uuid, uuid, text, text, text, text, text, text,
  integer, integer, text, boolean, integer, bigint, text, integer, boolean, text
) from public, anon, authenticated, service_role;
grant execute on function public.tcs_chat_write_diagnostic(
  text, uuid, uuid, uuid, text, text, text, text, text, text,
  integer, integer, text, boolean, integer, bigint, text, integer, boolean, text
) to anon;

create or replace function private._tcs_chat_get_diagnostics(
  p_diagnostic_id uuid, p_conversation_id uuid, p_visitor_id uuid,
  p_ip_address text, p_limit integer, p_server_key text
)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_ip inet;
  v_result jsonb;
begin
  if coalesce(private._tcs_owner_check_server_key(p_server_key), false) is not true then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_limit');
  end if;
  if p_ip_address is not null and p_ip_address <> '' then
    begin
      v_ip := p_ip_address::inet;
    exception when others then
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_ip_address');
    end;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'diagnostic_id', d.diagnostic_id, 'visitor_id', d.visitor_id,
        'conversation_id', d.conversation_id, 'conversation_title', d.conversation_title,
        'ip_address', d.ip_address::text, 'user_agent', d.user_agent,
        'request_mode', d.request_mode, 'model_name', d.model_name,
        'request_status', d.request_status, 'http_status', d.http_status,
        'upstream_status', d.upstream_status, 'finish_reason', d.finish_reason,
        'stream_done_received', d.stream_done_received,
        'response_characters', d.response_characters, 'response_bytes', d.response_bytes,
        'client_received_characters', d.client_received_characters,
        'client_received_done', d.client_received_done, 'error_code', d.error_code,
        'created_at', d.created_at, 'completed_at', d.completed_at, 'expires_at', d.expires_at
      ) order by d.created_at desc
    ), '[]'::jsonb
  ) into v_result
  from (
    select * from private.tcs_chat_diagnostics
    where (p_diagnostic_id is null or diagnostic_id = p_diagnostic_id)
      and (p_conversation_id is null or conversation_id = p_conversation_id)
      and (p_visitor_id is null or visitor_id = p_visitor_id)
      and (v_ip is null or ip_address = v_ip)
      and expires_at > pg_catalog.now()
    order by created_at desc limit p_limit
  ) d;
  return pg_catalog.jsonb_build_object('ok', true, 'records', v_result);
end;
$function$;

revoke all on function private._tcs_chat_get_diagnostics(uuid, uuid, uuid, text, integer, text)
  from public, anon, authenticated, service_role;

create or replace function public.tcs_chat_get_diagnostics(
  p_diagnostic_id uuid, p_conversation_id uuid, p_visitor_id uuid,
  p_ip_address text, p_limit integer, p_server_key text
)
returns jsonb language sql security definer set search_path to ''
as $function$
  select private._tcs_chat_get_diagnostics(
    p_diagnostic_id, p_conversation_id, p_visitor_id, p_ip_address, p_limit, p_server_key
  );
$function$;

revoke all on function public.tcs_chat_get_diagnostics(uuid, uuid, uuid, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.tcs_chat_get_diagnostics(uuid, uuid, uuid, text, integer, text)
  to anon, authenticated, service_role;
