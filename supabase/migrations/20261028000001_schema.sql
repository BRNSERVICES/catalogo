-- Catálogo Telecom — migration 1: esquema, índices, triggers de auditoria.
-- Convenções: tabelas em public; funções auxiliares em schema "private" (não exposto pela API).
-- Regra de ouro: nada aqui descarta dado de origem; dados brutos ficam em import_source_rows.

create extension if not exists pg_trgm with schema extensions;
create schema if not exists private;

------------------------------------------------------------------ perfis
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'consulta'
              check (role in ('administrador','editor','consulta')),
  -- Novos usuários nascem INATIVOS: um administrador precisa liberar o acesso.
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-------------------------------------------------- funções auxiliares (private)
create function private.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and active
$$;
create function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_app_role() is not null
$$;
create function private.is_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_app_role() in ('editor','administrador'), false)
$$;
create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_app_role() = 'administrador', false)
$$;

create function private.touch_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare rec jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs(table_name, record_id, action, old_data, new_data, user_id)
  values (tg_table_name, (rec->>'id')::uuid, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
          auth.uid());
  return null;
end $$;

-- Impede que usuários comuns alterem o próprio papel/ativação.
-- Chamadas sem JWT (SQL Editor do Supabase, como no primeiro administrador) são permitidas.
create function private.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not private.is_admin() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.id is distinct from old.id
       or new.email is distinct from old.email then
      raise exception 'Somente administradores podem alterar perfil de acesso ou status.';
    end if;
  end if;
  return new;
end $$;

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_update();

-------------------------------------------------------------- localidades
create table public.locations (
  id            uuid primary key default gen_random_uuid(),
  code          text,
  name          text not null,
  kind          text not null default 'dc' check (kind in ('tele_house','dc','outro')),
  street_address text,
  city          text,
  state         text,
  postal_code   text,
  area_room     text,
  responsible   text,
  notes         text,
  status        text not null default 'a_validar' check (status in ('ativo','inativo','a_validar')),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz
);
create unique index locations_code_uq on public.locations (lower(code)) where code is not null and deleted_at is null;

-- Grafias encontradas na planilha (TLH1 / TLH01 / THL1 ...) apontando para a localidade oficial.
create table public.location_aliases (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  alias       text not null,
  confirmed   boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create unique index location_aliases_uq on public.location_aliases (lower(alias));
create index location_aliases_loc_idx on public.location_aliases (location_id);

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  name        text not null,
  notes       text,
  status      text not null default 'ativo' check (status in ('ativo','inativo','a_validar')),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  deleted_at  timestamptz
);
create index rooms_loc_idx on public.rooms (location_id);

-- Catálogo de siglas observadas nas etiquetas (FT, SR, PN, BJ, MD, SH, SL, DGO, CTA, EDGE, RR).
-- O significado só é preenchido quando confirmado pela equipe.
create table public.code_catalog (
  code        text primary key,
  meaning     text,
  confirmed   boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
insert into public.code_catalog(code) values
  ('FT'),('SR'),('PN'),('BJ'),('MD'),('SH'),('SL'),('DGO'),('CTA'),('EDGE'),('RR')
on conflict do nothing;

--------------------------------------------------------- infraestrutura física
create table public.racks (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid references public.locations(id),
  room_id       uuid references public.rooms(id),
  code          text not null,
  kind          text not null default 'outro' check (kind in ('odf','dgo','equipamento','outro')),
  capacity_text text,
  positions     integer,
  notes         text,
  attrs         jsonb not null default '{}',
  status        text not null default 'a_validar' check (status in ('ativo','inativo','a_validar')),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz
);
create index racks_loc_idx on public.racks (location_id);
create index racks_room_idx on public.racks (room_id);
create unique index racks_uq on public.racks
  (coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(code))
  where deleted_at is null;

create table public.equipment (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid references public.locations(id),
  rack_id        uuid references public.racks(id),
  name           text not null,           -- ex.: CTIABZAF
  equipment_type text,
  manufacturer   text,
  model          text,
  asset_id       text,
  rack_position  text,
  notes          text,
  attrs          jsonb not null default '{}',
  status         text not null default 'a_validar' check (status in ('ativo','inativo','a_validar')),
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  deleted_at     timestamptz
);
create index equipment_loc_idx on public.equipment (location_id);
create index equipment_rack_idx on public.equipment (rack_id);
create index equipment_name_idx on public.equipment (lower(name));

create table public.equipment_interfaces (
  id             uuid primary key default gen_random_uuid(),
  equipment_id   uuid not null references public.equipment(id),
  slot           text,
  name           text,
  port_text      text,                    -- texto original, ex.: "0/0/9"
  interface_type text,
  notes          text,
  attrs          jsonb not null default '{}',
  status         text not null default 'a_validar' check (status in ('ativo','inativo','a_validar')),
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  deleted_at     timestamptz
);
create index equipment_interfaces_eq_idx on public.equipment_interfaces (equipment_id);

create table public.odfs (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid references public.locations(id),
  rack_id         uuid references public.racks(id),
  code            text not null,          -- ex.: FT26, PN1, SR8
  kind            text,
  total_positions integer,
  label_text      text,                   -- texto da etiqueta física do painel
  notes           text,
  attrs           jsonb not null default '{}',
  status          text not null default 'a_validar' check (status in ('ativo','inativo','a_validar')),
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  deleted_at      timestamptz
);
create index odfs_rack_idx on public.odfs (rack_id);
create index odfs_loc_idx on public.odfs (location_id);

-- "P:9/10" = par de fibras com duas posições (confirmado pela equipe).
create table public.odf_ports (
  id            uuid primary key default gen_random_uuid(),
  odf_id        uuid not null references public.odfs(id),
  card          text,
  tray          text,
  position_from integer,
  position_to   integer,
  port_text     text not null,            -- texto original
  notes         text,
  attrs         jsonb not null default '{}',
  status        text not null default 'a_validar' check (status in ('ativo','inativo','a_validar')),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  check (position_to is null or (position_from is not null and position_to >= position_from))
);
create index odf_ports_odf_idx on public.odf_ports (odf_id);
create unique index odf_ports_uq on public.odf_ports (odf_id, position_from, position_to)
  where position_from is not null and deleted_at is null;

----------------------------------------------------------------- circuitos
create table public.circuits (
  id                    uuid primary key default gen_random_uuid(),
  -- Chave estável: 'cfs:<CFS>|do:<DO>' quando existem; senão 'hash:<sha256 do bloco>' (ver docs/ARQUITETURA.md).
  circuit_key           text not null,
  cfs                   text,
  do_number             text,
  rfs_name              text,
  identification_status text not null default 'identificado'
                        check (identification_status in ('identificado','sem_identificacao')),
  circuit_type          text,
  technology            text,
  bandwidth             text,
  origin_location_id    uuid references public.locations(id),
  origin_text           text,
  destination_location_id uuid references public.locations(id),
  destination_text      text,
  operational_status    text not null default 'a_validar'
                        check (operational_status in ('ativo','desconectado','inativo','a_validar')),
  installed_on          date,
  label_date            date,
  notes                 text,
  attrs                 jsonb not null default '{}',
  created_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  updated_at            timestamptz not null default now(),
  updated_by            uuid,
  deleted_at            timestamptz
);
create unique index circuits_key_uq on public.circuits (circuit_key) where deleted_at is null;
create index circuits_cfs_idx on public.circuits (cfs);
create index circuits_do_idx on public.circuits (do_number);

-- Um segmento = uma linha do bloco na planilha. A ordem A→Z NÃO está confirmada;
-- seq guarda a ordem original e order_status marca se alguém validou a sequência.
create table public.circuit_segments (
  id              uuid primary key default gen_random_uuid(),
  circuit_id      uuid not null references public.circuits(id) on delete cascade,
  seq             integer not null,
  order_status    text not null default 'nao_confirmada' check (order_status in ('nao_confirmada','confirmada')),
  a_odf_text      text,
  a_ne_text       text,
  z_odf_text      text,
  z_ne_text       text,
  observation     text,
  a_location_id   uuid references public.locations(id),
  a_odf_port_id   uuid references public.odf_ports(id),
  a_interface_id  uuid references public.equipment_interfaces(id),
  z_location_id   uuid references public.locations(id),
  z_odf_port_id   uuid references public.odf_ports(id),
  z_interface_id  uuid references public.equipment_interfaces(id),
  flags           text[] not null default '{}',
  attrs           jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  deleted_at      timestamptz
);
create unique index circuit_segments_uq on public.circuit_segments (circuit_id, seq) where deleted_at is null;
create index circuit_segments_a_port_idx on public.circuit_segments (a_odf_port_id);
create index circuit_segments_z_port_idx on public.circuit_segments (z_odf_port_id);
create index circuit_segments_a_if_idx on public.circuit_segments (a_interface_id);
create index circuit_segments_z_if_idx on public.circuit_segments (z_interface_id);

-- Cordão/jumper físico, inclusive os dados da etiqueta (ID = CFS, DO, DATA).
create table public.connections (
  id             uuid primary key default gen_random_uuid(),
  a_odf_port_id  uuid references public.odf_ports(id),
  a_interface_id uuid references public.equipment_interfaces(id),
  z_odf_port_id  uuid references public.odf_ports(id),
  z_interface_id uuid references public.equipment_interfaces(id),
  circuit_id     uuid references public.circuits(id),
  label_text     text,
  label_date     date,
  cfs            text,
  do_number      text,
  notes          text,
  status         text not null default 'a_validar' check (status in ('ativo','inativo','a_validar')),
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid,
  deleted_at     timestamptz
);
create index connections_circuit_idx on public.connections (circuit_id);

------------------------------------------------- importação e rastreabilidade
create table public.import_jobs (
  id               uuid primary key default gen_random_uuid(),
  file_name        text not null,
  file_sha256      text not null,
  status           text not null default 'previa' check (status in ('previa','confirmado','cancelado','erro')),
  mapping          jsonb not null default '{}',
  summary          jsonb not null default '{}',
  validation_report jsonb not null default '[]',
  started_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  confirmed_at     timestamptz
);
-- A mesma versão do arquivo não é confirmada duas vezes.
create unique index import_jobs_confirmed_uq on public.import_jobs (file_sha256) where status = 'confirmado';

-- Cópia fiel de cada linha da planilha (inclusive colunas não mapeadas e linhas em branco relevantes).
create table public.import_source_rows (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.import_jobs(id) on delete cascade,
  sheet_name     text not null,
  row_number     integer not null,
  block_index    integer,
  row_role       text not null default 'dado' check (row_role in ('cabecalho','dado','separador','bruto')),
  cells          jsonb not null,           -- [{"col":"F","header":"ODF_CARD_PORT_PATH_A","value":"..."}]
  merged_info    jsonb,
  content_hash   text not null,
  classification text not null default 'nao_classificado'
                 check (classification in ('nao_classificado','classificado','apenas_bruto','ignorado')),
  created_at     timestamptz not null default now(),
  unique (job_id, sheet_name, row_number)
);
create index import_source_rows_hash_idx on public.import_source_rows (content_hash);
create index import_source_rows_sheet_idx on public.import_source_rows (sheet_name, row_number);

-- Liga cada registro normalizado às linhas de origem.
create table public.source_links (
  id            uuid primary key default gen_random_uuid(),
  source_row_id uuid not null references public.import_source_rows(id) on delete cascade,
  entity_table  text not null,
  entity_id     uuid not null,
  created_at    timestamptz not null default now(),
  unique (source_row_id, entity_table, entity_id)
);
create index source_links_entity_idx on public.source_links (entity_table, entity_id);

create table public.audit_logs (
  id         bigint generated always as identity primary key,
  table_name text not null,
  record_id  uuid,
  action     text not null,
  old_data   jsonb,
  new_data   jsonb,
  user_id    uuid,
  created_at timestamptz not null default now()
);
create index audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at desc);
create index audit_logs_time_idx on public.audit_logs (created_at desc);

------------------------------------------------ índices de busca (trigramas)
create index locations_name_trgm on public.locations using gin (name extensions.gin_trgm_ops);
create index racks_code_trgm on public.racks using gin (code extensions.gin_trgm_ops);
create index equipment_name_trgm on public.equipment using gin (name extensions.gin_trgm_ops);
create index equipment_asset_trgm on public.equipment using gin (asset_id extensions.gin_trgm_ops);
create index odfs_code_trgm on public.odfs using gin (code extensions.gin_trgm_ops);
create index odf_ports_text_trgm on public.odf_ports using gin (port_text extensions.gin_trgm_ops);
create index circuits_cfs_trgm on public.circuits using gin (cfs extensions.gin_trgm_ops);
create index circuits_do_trgm on public.circuits using gin (do_number extensions.gin_trgm_ops);
create index circuits_rfs_trgm on public.circuits using gin (rfs_name extensions.gin_trgm_ops);
create index segments_a_odf_trgm on public.circuit_segments using gin (a_odf_text extensions.gin_trgm_ops);
create index segments_a_ne_trgm on public.circuit_segments using gin (a_ne_text extensions.gin_trgm_ops);
create index segments_z_odf_trgm on public.circuit_segments using gin (z_odf_text extensions.gin_trgm_ops);
create index segments_z_ne_trgm on public.circuit_segments using gin (z_ne_text extensions.gin_trgm_ops);

------------------------------------------- triggers de atualização e auditoria
do $$
declare t text;
begin
  foreach t in array array['profiles','locations','location_aliases','rooms','code_catalog','racks',
    'equipment','equipment_interfaces','odfs','odf_ports','circuits','circuit_segments','connections']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_row()', t||'_touch', t);
  end loop;
  foreach t in array array['profiles','locations','location_aliases','rooms','code_catalog','racks',
    'equipment','equipment_interfaces','odfs','odf_ports','circuits','circuit_segments','connections','import_jobs']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', t||'_audit', t);
  end loop;
end $$;
