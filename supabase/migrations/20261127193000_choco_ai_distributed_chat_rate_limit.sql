-- Distributed, privacy-preserving rate limits for Choco AI chat.
-- The raw client address is never stored. Only a SHA-256 subject hash is retained.
-- The public RPC is a server-key-gated wrapper; direct table access stays revoked.

create table if not exists private.tcs_chat_rate_limits (
  scope text not null
    check (scope ~ '^[a-z0-9:_-]{1,64}$'),
  subject_hash text not null
    check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 0
    check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, subject_hash)
);

alter table private.tcs_chat_rate_limits enable row level security;

create index if not exists idx_tcs_chat_rate_limits_updated_at
  on private.tcs_chat_rate_limits (updated_at);

revoke all on table private.tcs_chat_rate_limits
  from public, anon, authenticated, service_role;

comment on table private.tcs_chat_rate_limits is
  'Server-only, hashed-subject rate-limit counters. Contains no raw IP addresses, prompts, or chat content.';

create or replace function private._tcs_chat_consume_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_window_seconds integer,
  p_max_requests integer,
  p_server_key text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window_started_at timestamptz;
  v_request_count integer;
  v_reset_at timestamptz;
  v_retry_after integer;
begin
  if coalesce(private._tcs_owner_check_server_key(p_server_key), false) is not true then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  if p_scope is null or p_scope !~ '^[a-z0-9:_-]{1,64}$'
     or p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$'
     or p_window_seconds is null or p_window_seconds < 60 or p_window_seconds > 3600
     or p_max_requests is null or p_max_requests < 1 or p_max_requests > 1000 then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_rate_limit_arguments');
  end if;

  insert into private.tcs_chat_rate_limits as current_bucket (
    scope,
    subject_hash,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_scope,
    p_subject_hash,
    v_now,
    1,
    v_now
  )
  on conflict (scope, subject_hash) do update
  set
    window_started_at = case
      when current_bucket.window_started_at <=
        v_now - pg_catalog.make_interval(secs => p_window_seconds)
      then v_now
      else current_bucket.window_started_at
    end,
    request_count = case
      when current_bucket.window_started_at <=
        v_now - pg_catalog.make_interval(secs => p_window_seconds)
      then 1
      else current_bucket.request_count + 1
    end,
    updated_at = v_now
  returning window_started_at, request_count
    into v_window_started_at, v_request_count;

  v_reset_at := v_window_started_at + pg_catalog.make_interval(secs => p_window_seconds);
  v_retry_after := greatest(
    1,
    ceil(extract(epoch from (v_reset_at - v_now)))::integer
  );

  -- Opportunistic cleanup is tied to a high-volume bucket, so normal requests
  -- do not scan the full table. Expired rows are not required for correctness.
  if mod(v_request_count, 100) = 0 then
    delete from private.tcs_chat_rate_limits
    where updated_at < v_now - interval '30 days';
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'allowed', v_request_count <= p_max_requests,
    'limit', p_max_requests,
    'remaining', greatest(0, p_max_requests - v_request_count),
    'reset_at', v_reset_at,
    'retry_after_seconds', v_retry_after
  );
end;
$function$;

revoke all on function private._tcs_chat_consume_rate_limit(text, text, integer, integer, text)
  from public, anon, authenticated, service_role;

create or replace function public.tcs_chat_consume_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_window_seconds integer,
  p_max_requests integer,
  p_server_key text
)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select private._tcs_chat_consume_rate_limit(
    p_scope,
    p_subject_hash,
    p_window_seconds,
    p_max_requests,
    p_server_key
  );
$function$;

revoke all on function public.tcs_chat_consume_rate_limit(text, text, integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.tcs_chat_consume_rate_limit(text, text, integer, integer, text)
  to anon, authenticated, service_role;
