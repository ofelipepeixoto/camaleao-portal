-- B1: additive text deliveries only; no Storage, remote Auth or worker changes.
begin;
create table public.camaleao_deliveries (
  id uuid primary key,
  organization_id uuid not null,
  request_id uuid not null,
  version integer not null check (version > 0),
  content text not null check (char_length(content) between 10 and 8000),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id,request_id) references public.camaleao_requests(organization_id,id),
  unique (request_id,version), unique (organization_id,request_id,id,content_hash)
);
create table public.camaleao_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  delivery_id uuid not null unique,
  content_hash text not null,
  version integer not null,
  client_decision_id uuid not null,
  actor_id uuid not null references auth.users(id),
  outcome text not null check (outcome in ('approved','changes_requested')),
  adjustment text not null,
  decided_at timestamptz not null default clock_timestamp(),
  check ((outcome='approved' and adjustment='') or (outcome='changes_requested' and char_length(adjustment) between 10 and 2000)),
  foreign key (organization_id,request_id,delivery_id,content_hash)
    references public.camaleao_deliveries(organization_id,request_id,id,content_hash),
  unique (organization_id,client_decision_id)
);
create table camaleao_private.delivery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null,
  delivery_id uuid not null,
  kind text not null check (kind in ('presented','approved','changes_requested')),
  created_at timestamptz not null default clock_timestamp(),
  unique (delivery_id,kind),
  foreign key (organization_id,request_id) references public.camaleao_requests(organization_id,id)
);
alter table public.camaleao_deliveries enable row level security;
alter table public.camaleao_decisions enable row level security;
alter table camaleao_private.delivery_events enable row level security;
revoke all on public.camaleao_deliveries,public.camaleao_decisions,camaleao_private.delivery_events from public,anon,authenticated,camaleao_worker;
grant select on public.camaleao_deliveries,public.camaleao_decisions to authenticated;
create policy camaleao_read_deliveries on public.camaleao_deliveries for select to authenticated
using (exists (select 1 from public.camaleao_memberships m where m.organization_id=camaleao_deliveries.organization_id and m.user_id=(select auth.uid()) and m.active));
create policy camaleao_read_decisions on public.camaleao_decisions for select to authenticated
using (exists (select 1 from public.camaleao_memberships m where m.organization_id=camaleao_decisions.organization_id and m.user_id=(select auth.uid()) and m.active));
-- Immutable even for an accidental privileged UPDATE/DELETE. Administrative
-- retention/erasure needs a separately reviewed procedure, not a client API.
create function camaleao_private.reject_delivery_mutation() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin raise exception 'Registro imutável.' using errcode='42501'; end;
$$;
revoke all on function camaleao_private.reject_delivery_mutation() from public,anon,authenticated;
create trigger immutable_delivery before update or delete on public.camaleao_deliveries
for each row execute function camaleao_private.reject_delivery_mutation();
create trigger immutable_decision before update or delete on public.camaleao_decisions
for each row execute function camaleao_private.reject_delivery_mutation();
-- Serialize session/membership revocation with B mutations; validate again after
-- request-lock waits using wall clock (JWT expiry must not freeze at BEGIN).
create function camaleao_private.authorize_delivery(p_org uuid,p_role text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid(); claims jsonb:=auth.jwt(); member_role text;
begin
  if camaleao_private.session_is_valid() is distinct from true then raise exception 'Sessão inválida.' using errcode='42501'; end if;
  perform 1 from auth.sessions where id=(claims->>'session_id')::uuid and user_id=actor for share;
  if not found then raise exception 'Sessão revogada.' using errcode='42501'; end if;
  select role into member_role from public.camaleao_memberships where organization_id=p_org and user_id=actor and active for share;
  if member_role is distinct from p_role then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
  return actor;
end;
$$;
revoke all on function camaleao_private.authorize_delivery(uuid,text) from public,anon,authenticated;
create function camaleao_private.present_delivery(p_organization_id uuid,p_request_id uuid,p_delivery_id uuid,p_expected_delivery_id uuid,p_content text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid; latest public.camaleao_deliveries; inserted public.camaleao_deliveries; existing public.camaleao_deliveries;
begin
  actor:=camaleao_private.authorize_delivery(p_organization_id,'operator');
  if p_delivery_id is null or p_content is null or char_length(btrim(p_content)) not between 10 and 8000 then raise exception 'Conteúdo inválido.' using errcode='22023'; end if;
  perform 1 from public.camaleao_requests where organization_id=p_organization_id and id=p_request_id for update;
  if not found then raise exception 'Pedido inacessível.' using errcode='42501'; end if;
  if (auth.jwt()->>'exp')::numeric <= extract(epoch from clock_timestamp()) then raise exception 'Sessão expirada.' using errcode='42501'; end if;
  select * into latest from public.camaleao_deliveries where request_id=p_request_id order by version desc limit 1;
  select * into existing from public.camaleao_deliveries where id=p_delivery_id;
  if found then
    if existing.organization_id<>p_organization_id or existing.request_id<>p_request_id or existing.created_by<>actor or existing.content<>btrim(p_content) or latest.id<>existing.id then raise exception 'Versão conflitante.' using errcode='23505'; end if;
    return to_jsonb(existing);
  end if;
  if latest.id is distinct from p_expected_delivery_id then raise exception 'Nova versão disponível.' using errcode='40001'; end if;
  insert into public.camaleao_deliveries(id,organization_id,request_id,version,content,content_hash,created_by)
  values(p_delivery_id,p_organization_id,p_request_id,coalesce(latest.version,0)+1,btrim(p_content),
    encode(sha256(convert_to(btrim(p_content),'UTF8')),'hex'),actor) returning * into inserted;
  insert into camaleao_private.delivery_events(organization_id,request_id,delivery_id,kind) values(p_organization_id,p_request_id,p_delivery_id,'presented');
  return to_jsonb(inserted);
end;
$$;
create function camaleao_private.decide_delivery(p_organization_id uuid,p_request_id uuid,p_delivery_id uuid,p_content_hash text,p_decision_id uuid,p_outcome text,p_adjustment text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid; latest public.camaleao_deliveries; existing public.camaleao_decisions; inserted public.camaleao_decisions; adjustment text:=btrim(coalesce(p_adjustment,''));
begin
  actor:=camaleao_private.authorize_delivery(p_organization_id,'client');
  if p_decision_id is null or p_outcome is null or p_outcome not in ('approved','changes_requested') or
    (p_outcome='approved' and adjustment<>'') or (p_outcome='changes_requested' and char_length(adjustment) not between 10 and 2000) then raise exception 'Decisão inválida.' using errcode='22023'; end if;
  perform 1 from public.camaleao_requests where organization_id=p_organization_id and id=p_request_id for update;
  if not found then raise exception 'Pedido inacessível.' using errcode='42501'; end if;
  if (auth.jwt()->>'exp')::numeric <= extract(epoch from clock_timestamp()) then raise exception 'Sessão expirada.' using errcode='42501'; end if;
  select * into latest from public.camaleao_deliveries where request_id=p_request_id order by version desc limit 1;
  if latest.id is null or latest.id is distinct from p_delivery_id or latest.content_hash is distinct from p_content_hash then raise exception 'Nova versão disponível.' using errcode='40001'; end if;
  select * into existing from public.camaleao_decisions where organization_id=p_organization_id and client_decision_id=p_decision_id;
  if found then
    if existing.request_id<>p_request_id or existing.delivery_id<>p_delivery_id or existing.actor_id<>actor or existing.outcome<>p_outcome or existing.adjustment<>adjustment then raise exception 'Decisão conflitante.' using errcode='23505'; end if;
    return to_jsonb(existing);
  end if;
  -- A fresh click ID never bypasses the one-effective-decision-per-version rule.
  if exists(select 1 from public.camaleao_decisions where delivery_id=p_delivery_id) then raise exception 'Versão já decidida.' using errcode='23505'; end if;
  insert into public.camaleao_decisions(organization_id,request_id,delivery_id,content_hash,version,client_decision_id,actor_id,outcome,adjustment)
  values(p_organization_id,p_request_id,p_delivery_id,p_content_hash,latest.version,p_decision_id,actor,p_outcome,adjustment) returning * into inserted;
  insert into camaleao_private.delivery_events(organization_id,request_id,delivery_id,kind) values(p_organization_id,p_request_id,p_delivery_id,p_outcome);
  return to_jsonb(inserted);
end;
$$;
revoke all on function camaleao_private.present_delivery(uuid,uuid,uuid,uuid,text),camaleao_private.decide_delivery(uuid,uuid,uuid,text,uuid,text,text) from public,anon;
grant execute on function camaleao_private.present_delivery(uuid,uuid,uuid,uuid,text),camaleao_private.decide_delivery(uuid,uuid,uuid,text,uuid,text,text) to authenticated;
create function public.camaleao_present_delivery(p_organization_id uuid,p_request_id uuid,p_delivery_id uuid,p_expected_delivery_id uuid,p_content text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
select camaleao_private.present_delivery(p_organization_id,p_request_id,p_delivery_id,p_expected_delivery_id,p_content);
$$;
create function public.camaleao_decide_delivery(p_organization_id uuid,p_request_id uuid,p_delivery_id uuid,p_content_hash text,p_decision_id uuid,p_outcome text,p_adjustment text)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
select camaleao_private.decide_delivery(p_organization_id,p_request_id,p_delivery_id,p_content_hash,p_decision_id,p_outcome,p_adjustment);
$$;
revoke all on function public.camaleao_present_delivery(uuid,uuid,uuid,uuid,text),public.camaleao_decide_delivery(uuid,uuid,uuid,text,uuid,text,text) from public,anon;
grant execute on function public.camaleao_present_delivery(uuid,uuid,uuid,uuid,text),public.camaleao_decide_delivery(uuid,uuid,uuid,text,uuid,text,text) to authenticated;
commit;
