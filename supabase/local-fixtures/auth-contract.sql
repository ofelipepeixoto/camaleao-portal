-- TEST ONLY. Minimal Auth contract for SQL tests, not a Supabase Auth server.
-- The runner only accepts a fresh in-memory DB or an empty loopback test DB.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create table auth.sessions (id uuid primary key,user_id uuid not null references auth.users(id));
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$
  select (auth.jwt()->>'sub')::uuid
$$;
grant usage on schema public,auth to anon,authenticated;
grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
