-- Catálogo Telecom — migration 2: RLS e permissões.
-- Modelo: autenticado + perfil ATIVO. Leitura: qualquer perfil ativo. Escrita: editor/administrador.
-- Exclusão física: só administrador (editores usam exclusão lógica via deleted_at).

-- Funções de private só podem ser executadas por usuários autenticados.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_app_role(), private.is_member(),
  private.is_editor(), private.is_admin() to authenticated;

-- Sem acesso anônimo a nada; usuários autenticados só recebem o que as políticas permitirem.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;
revoke insert, delete on public.profiles from authenticated;

-- Tabelas de dados técnicos: política padrão por perfil.
do $$
declare t text;
begin
  foreach t in array array['locations','location_aliases','rooms','code_catalog','racks',
    'equipment','equipment_interfaces','odfs','odf_ports','circuits','circuit_segments','connections']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_member()))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_editor()))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_editor())) with check ((select private.is_editor()))', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))', t||'_delete', t);
  end loop;
end $$;

-- Importação: leitura para perfis ativos (rastreabilidade); escrita só administrador.
do $$
declare t text;
begin
  foreach t in array array['import_jobs','import_source_rows','source_links']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_member()))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))', t||'_delete', t);
  end loop;
end $$;

-- Perfis: cada um vê o próprio; administrador vê e altera todos.
-- A troca de papel/ativação por não administradores é bloqueada pelo trigger profiles_guard.
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- Auditoria: somente leitura por administrador; gravação apenas pelos triggers.
alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select private.is_admin()));
