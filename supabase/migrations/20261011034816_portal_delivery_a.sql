-- Delivery A. ADDITIVE, prepared for review; not applied to a remote project.
-- Requires Supabase Auth schema/roles. No Auth settings, password or Storage changes.
begin;

create schema camaleao_private;
revoke all on schema camaleao_private from public, anon, authenticated;
grant usage on schema camaleao_private to authenticated;

-- Disabled capability role. A separate reviewed credential is needed in delivery C.
create role camaleao_worker nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema camaleao_private to camaleao_worker;

create table public.camaleao_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.camaleao_memberships (
  organization_id uuid not null references public.camaleao_organizations(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('client','operator')),
  active boolean not null default true,
  primary key (organization_id,user_id)
);
create index camaleao_memberships_user_idx on public.camaleao_memberships(user_id,organization_id) where active;
create table public.camaleao_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.camaleao_organizations(id),
  client_request_id uuid not null,
  created_by uuid not null references auth.users(id),
  protocol text not null unique default ('CAM-' || upper(replace(gen_random_uuid()::text,'-',''))),
  category text not null check (category in ('peca_social','campanha','site','automacao')),
  goal text not null check (char_length(goal) between 1 and 120),
  channel text check (char_length(channel) <= 80),
  format text check (char_length(format) <= 80),
  context text not null check (char_length(context) between 10 and 2000),
  desired_deadline date,
  urgency text not null check (urgency in ('normal','urgente')),
  status text not null default 'recebido' check (status in ('recebido','em_triagem')),
  triage_queue text check (triage_queue in ('design_social','estrategia_campanha','web','automacoes')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,client_request_id),
  unique (organization_id,id),
  foreign key (organization_id,created_by) references public.camaleao_memberships(organization_id,user_id)
);
create index camaleao_requests_org_created_idx on public.camaleao_requests(organization_id,created_at desc);
create table camaleao_private.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null unique,
  input jsonb not null,
  state text not null default 'pending' check (state in ('pending','running','completed','failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  error_code text check (error_code in ('DB_UNAVAILABLE','NETWORK_TIMEOUT','WORKER_INTERRUPTED','INVALID_REQUEST','ATTEMPTS_EXHAUSTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,request_id) references public.camaleao_requests(organization_id,id),
  unique (organization_id,id)
);
create index camaleao_jobs_pending_idx on camaleao_private.jobs(available_at,id) where state in ('pending','running');
create table camaleao_private.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  kind text not null check (kind in ('request_received','request_triaged','job_retry','job_failed')),
  attempt integer not null default 0 check (attempt between 0 and 3),
  created_at timestamptz not null default now(),
  foreign key (organization_id,request_id) references public.camaleao_requests(organization_id,id),
  unique (request_id,kind,attempt)
);

alter table public.camaleao_organizations enable row level security;
alter table public.camaleao_memberships enable row level security;
alter table public.camaleao_requests enable row level security;
alter table camaleao_private.jobs enable row level security;
alter table camaleao_private.events enable row level security;
revoke all on public.camaleao_organizations, public.camaleao_memberships, public.camaleao_requests from public, anon, authenticated;
revoke all on camaleao_private.jobs, camaleao_private.events from public, anon, authenticated, camaleao_worker;
grant select on public.camaleao_organizations, public.camaleao_memberships, public.camaleao_requests to authenticated;

-- Minimal privileged Auth lookup: JWT expiry AND current session row are checked.
-- The Auth gateway verifies signature; this function never accepts user_metadata.
create function camaleao_private.session_is_valid() returns boolean
language plpgsql stable security definer set search_path = pg_catalog as $$
declare claims jsonb; session_uuid uuid; expiry numeric;
begin
  claims := auth.jwt();
  if auth.uid() is null or claims->>'is_anonymous' = 'true' then return false; end if;
  session_uuid := (claims->>'session_id')::uuid;
  expiry := (claims->>'exp')::numeric;
  return coalesce(expiry > extract(epoch from now()) and exists (
    select 1 from auth.sessions s where s.id = session_uuid and s.user_id = auth.uid()
  ),false);
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;
$$;
revoke all on function camaleao_private.session_is_valid() from public, anon;
grant execute on function camaleao_private.session_is_valid() to authenticated;

create policy camaleao_own_memberships on public.camaleao_memberships for select to authenticated
using ((select camaleao_private.session_is_valid()) and user_id = (select auth.uid()) and active);
create policy camaleao_member_organizations on public.camaleao_organizations for select to authenticated
using (exists (select 1 from public.camaleao_memberships m where m.organization_id = id and m.user_id = (select auth.uid()) and m.active));
create policy camaleao_member_requests on public.camaleao_requests for select to authenticated
using (exists (select 1 from public.camaleao_memberships m where m.organization_id = camaleao_requests.organization_id and m.user_id = (select auth.uid()) and m.active));

-- Only this private core can write; the public wrapper below is SECURITY INVOKER.
-- Authorization is explicit because the core owns the tables and bypasses RLS.
create function camaleao_private.create_request(p_organization_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare actor uuid := auth.uid(); normalized jsonb; existing public.camaleao_requests;
  inserted public.camaleao_requests; deadline date; member_active boolean;
begin
  if camaleao_private.session_is_valid() is distinct from true or actor is null then
    raise exception 'Sessão inválida. Entre novamente.' using errcode='42501';
  end if;
  select active into member_active from public.camaleao_memberships
    where organization_id=p_organization_id and user_id=actor for share;
  if member_active is distinct from true then
    raise exception 'Acesso à organização não autorizado.' using errcode='42501';
  end if;
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16000 then
    raise exception 'Pedido inválido.' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_payload) as k where k not in ('category','goal','channel','format','context','desired_deadline','urgency')) then
    raise exception 'Campo não permitido.' using errcode='22023';
  end if;
  if jsonb_typeof(p_payload->'category') is distinct from 'string' or p_payload->>'category' not in ('peca_social','campanha','site','automacao')
     or jsonb_typeof(p_payload->'goal') is distinct from 'string' or char_length(btrim(p_payload->>'goal')) not between 1 and 120
     or jsonb_typeof(p_payload->'context') is distinct from 'string' or char_length(btrim(p_payload->>'context')) not between 10 and 2000 then
    raise exception 'Preencha tipo, objetivo e contexto nos limites indicados.' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_each(p_payload) where key in ('channel','format') and
      (jsonb_typeof(value) not in ('string','null') or char_length(btrim(value#>>'{}')) > 80)) then
    raise exception 'Canal ou formato inválido.' using errcode='22023';
  end if;
  if p_payload ? 'urgency' and (jsonb_typeof(p_payload->'urgency') is distinct from 'string' or p_payload->>'urgency' not in ('normal','urgente')) then
    raise exception 'Urgência inválida.' using errcode='22023';
  end if;
  if p_payload->'desired_deadline' is not null and p_payload->'desired_deadline' <> 'null'::jsonb then
    if jsonb_typeof(p_payload->'desired_deadline') <> 'string' or p_payload->>'desired_deadline' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Prazo inválido.' using errcode='22023';
    end if;
    begin
      deadline := (p_payload->>'desired_deadline')::date;
      if to_char(deadline,'YYYY-MM-DD') <> p_payload->>'desired_deadline' then raise exception 'Prazo inválido.' using errcode='22023'; end if;
    exception when datetime_field_overflow or invalid_datetime_format then
      raise exception 'Prazo inválido.' using errcode='22023';
    end;
  end if;
  normalized := jsonb_build_object('category',p_payload->>'category','goal',btrim(p_payload->>'goal'),
    'context',btrim(p_payload->>'context'),'channel',nullif(btrim(p_payload->>'channel'),''),
    'format',nullif(btrim(p_payload->>'format'),''),'desired_deadline',deadline,
    'urgency',coalesce(p_payload->>'urgency','normal'));
  -- Per-organization lock serializes deduplication and the 20-new-requests/day limit.
  perform 1 from public.camaleao_organizations where id=p_organization_id for update;
  select * into existing from public.camaleao_requests where organization_id=p_organization_id and client_request_id=p_request_id;
  if found then
    if existing.created_by <> actor or not exists (select 1 from camaleao_private.jobs j where j.request_id=existing.id and j.input=normalized) then
      raise exception 'Este identificador já foi usado com outro conteúdo.' using errcode='23505';
    end if;
    return to_jsonb(existing);
  end if;
  if (select count(*) from public.camaleao_requests where organization_id=p_organization_id and created_at >= now()-interval '24 hours') >= 20 then
    raise exception 'Limite de novos pedidos atingido. Tente mais tarde.' using errcode='54000';
  end if;
  insert into public.camaleao_requests (organization_id,client_request_id,created_by,category,goal,channel,format,context,desired_deadline,urgency)
    values (p_organization_id,p_request_id,actor,normalized->>'category',normalized->>'goal',normalized->>'channel',normalized->>'format',normalized->>'context',deadline,normalized->>'urgency')
    returning * into inserted;
  insert into camaleao_private.jobs (organization_id,request_id,input) values (p_organization_id,inserted.id,normalized);
  insert into camaleao_private.events (organization_id,request_id,kind) values (p_organization_id,inserted.id,'request_received');
  return to_jsonb(inserted);
end;
$$;
revoke all on function camaleao_private.create_request(uuid,uuid,jsonb) from public, anon;
grant execute on function camaleao_private.create_request(uuid,uuid,jsonb) to authenticated;
create function public.camaleao_create_request(p_organization_id uuid,p_request_id uuid,p_payload jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog as $$
  select camaleao_private.create_request(p_organization_id,p_request_id,p_payload);
$$;
revoke all on function public.camaleao_create_request(uuid,uuid,jsonb) from public, anon;
grant execute on function public.camaleao_create_request(uuid,uuid,jsonb) to authenticated;

-- Worker capability APIs. No client grant, no table access, no dynamic SQL.
create function camaleao_private.claim_jobs(p_limit integer default 10)
returns table (id uuid,request_id uuid,organization_id uuid,lease_token uuid,attempts integer,
  category text,goal text,channel text,format text,context text,desired_deadline date,urgency text)
language plpgsql security definer set search_path = pg_catalog as $$
begin
  if p_limit is null or p_limit not between 1 and 10 then raise exception 'Lote deve conter entre 1 e 10.' using errcode='22023'; end if;
  with expired_candidates as (
    select j.id from camaleao_private.jobs j
    where j.state='running' and j.lease_expires_at<=clock_timestamp() and j.attempts>=3
    order by j.lease_expires_at,j.id for update skip locked limit p_limit
  ), expired as (
    update camaleao_private.jobs j set state='failed',error_code='ATTEMPTS_EXHAUSTED',updated_at=now()
    from expired_candidates c where j.id=c.id
    returning j.organization_id,j.request_id,j.attempts
  ) insert into camaleao_private.events (organization_id,request_id,kind,attempt)
    select e.organization_id,e.request_id,'job_failed',e.attempts from expired e;
  return query
  with candidates as (
    select j.id from camaleao_private.jobs j
    where j.attempts<3 and ((j.state='pending' and j.available_at<=clock_timestamp()) or (j.state='running' and j.lease_expires_at<=clock_timestamp()))
    order by j.available_at,j.id for update skip locked limit p_limit
  ), claimed as (
    update camaleao_private.jobs j set state='running',attempts=j.attempts+1,lease_token=gen_random_uuid(),
      lease_expires_at=clock_timestamp()+interval '5 minutes',updated_at=now()
    from candidates c where j.id=c.id returning j.*
  ) select c.id,c.request_id,c.organization_id,c.lease_token,c.attempts,r.category,r.goal,r.channel,r.format,r.context,r.desired_deadline,r.urgency
    from claimed c join public.camaleao_requests r on r.id=c.request_id;
end;
$$;
revoke all on function camaleao_private.claim_jobs(integer) from public,anon,authenticated;
grant execute on function camaleao_private.claim_jobs(integer) to camaleao_worker;

create function camaleao_private.finish_job(p_job_id uuid,p_lease_token uuid,p_outcome text,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare job camaleao_private.jobs; request public.camaleao_requests; target_state text; event_kind text;
begin
  if p_outcome is null or p_outcome not in ('success','transient_error','validation_error') then
    raise exception 'Resultado inválido.' using errcode='22023';
  end if;
  select * into job from camaleao_private.jobs where id=p_job_id for update;
  if not found or job.lease_token is distinct from p_lease_token or p_lease_token is null then
    raise exception 'Lease inválido.' using errcode='23505';
  end if;
  -- Repeat acknowledgment is harmless, but only for the same successful token.
  if job.state='completed' and p_outcome='success' then
    return jsonb_build_object('job_id',job.id,'state','completed','status','em_triagem','replayed',true);
  end if;
  if job.state<>'running' or job.lease_expires_at<=clock_timestamp() then
    raise exception 'Lease vencido ou job finalizado.' using errcode='23505';
  end if;
  if p_outcome='success' then
    if p_error_code is not null then raise exception 'Sucesso não aceita código de erro.' using errcode='22023'; end if;
    select * into request from public.camaleao_requests where id=job.request_id for update;
    if request.status<>'recebido' then raise exception 'Estado do pedido incompatível.' using errcode='23505'; end if;
    update public.camaleao_requests set status='em_triagem',version=version+1,updated_at=now(),
      triage_queue=case category when 'peca_social' then 'design_social' when 'campanha' then 'estrategia_campanha' when 'site' then 'web' else 'automacoes' end
      where id=job.request_id;
    target_state:='completed'; event_kind:='request_triaged';
  elsif p_outcome='transient_error' then
    if p_error_code is null or p_error_code not in ('DB_UNAVAILABLE','NETWORK_TIMEOUT','WORKER_INTERRUPTED') then
      raise exception 'Código de falha transitória inválido.' using errcode='22023';
    end if;
    target_state:=case when job.attempts<3 then 'pending' else 'failed' end;
    event_kind:=case when target_state='pending' then 'job_retry' else 'job_failed' end;
  else
    if p_error_code is distinct from 'INVALID_REQUEST' then raise exception 'Código de validação inválido.' using errcode='22023'; end if;
    target_state:='failed'; event_kind:='job_failed';
  end if;
  update camaleao_private.jobs set state=target_state,error_code=p_error_code,
    available_at=now()+make_interval(secs=>least(120,30*job.attempts)),updated_at=now()
    where id=job.id;
  insert into camaleao_private.events (organization_id,request_id,kind,attempt)
    values (job.organization_id,job.request_id,event_kind,job.attempts);
  return jsonb_build_object('job_id',job.id,'state',target_state,'status',case when target_state='completed' then 'em_triagem' else 'recebido' end,'replayed',false);
end;
$$;
revoke all on function camaleao_private.finish_job(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function camaleao_private.finish_job(uuid,uuid,text,text) to camaleao_worker;
commit;
