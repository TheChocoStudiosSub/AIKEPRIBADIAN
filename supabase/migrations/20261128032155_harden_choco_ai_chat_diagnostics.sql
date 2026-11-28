-- Backend hardening for Choco AI chat diagnostics.
-- One-time client receipts, scheduled retention cleanup, and strict internal access.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

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
  if p_stage is null or p_stage not in ('start', 'finish', 'client_report')
     or p_diagnostic_id is null or p_visitor_id is null then
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

  if p_client_received_characters is null or p_client_received_done is null then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_client_report');
  end if;

  update private.tcs_chat_diagnostics
  set client_received_characters = greatest(0, p_client_received_characters),
      client_received_done = p_client_received_done
  where diagnostic_id = p_diagnostic_id
    and visitor_id = p_visitor_id
    and client_received_characters is null
    and client_received_done is null;
  return pg_catalog.jsonb_build_object('ok', found, 'stage', 'client_report');
end;
$function$;

create or replace function private.tcs_chat_cleanup_expired_diagnostics()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_deleted bigint;
begin
  delete from private.tcs_chat_diagnostics
  where expires_at <= pg_catalog.clock_timestamp();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

comment on function private.tcs_chat_cleanup_expired_diagnostics() is
  'Internal-only cleanup of all expired Choco AI chat diagnostic rows; scheduled every 15 minutes.';

revoke all on function private.tcs_chat_cleanup_expired_diagnostics()
  from public, anon, authenticated, service_role;
grant execute on function private.tcs_chat_cleanup_expired_diagnostics()
  to postgres;

-- Idempotently replace the named retention job if this migration is re-applied.
select cron.unschedule(jobid)
from cron.job
where jobname = 'tcs-chat-diagnostics-retention';

select cron.schedule(
  'tcs-chat-diagnostics-retention',
  '*/15 * * * *',
  'select private.tcs_chat_cleanup_expired_diagnostics();'
);
