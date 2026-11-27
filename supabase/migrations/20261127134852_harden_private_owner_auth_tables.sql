-- Defense-in-depth for Owner authentication state.
-- These tables are accessed only by SECURITY DEFINER routines owned by postgres.
-- The function owner has BYPASSRLS; browser roles have no table privileges or schema usage.


alter table private.tcs_owner_auth_attempts enable row level security;
alter table private.tcs_owner_auth_config enable row level security;

revoke all on table private.tcs_owner_auth_attempts
  from public, anon, authenticated, service_role;
revoke all on table private.tcs_owner_auth_config
  from public, anon, authenticated, service_role;

comment on table private.tcs_owner_auth_attempts is
  'Private Owner login attempt counters. Access is limited to server-owned SECURITY DEFINER routines.';
comment on table private.tcs_owner_auth_config is
  'Private Owner authentication configuration and server-key hash. Never directly accessible from client roles.';

