-- Catálogo Telecom — migration 3: busca paginada de circuitos e gravação da importação.
-- Ambas SECURITY INVOKER: o RLS do chamador continua valendo.

create function public.search_circuits(
  p_q text default null, p_status text default null, p_limit int default 25, p_offset int default 0
) returns table (
  id uuid, cfs text, do_number text, rfs_name text, identification_status text,
  operational_status text, updated_at timestamptz, total bigint
)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select case when nullif(trim(p_q), '') is null then null
      else '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' end as pat
  )
  select c.id, c.cfs, c.do_number, c.rfs_name, c.identification_status, c.operational_status, c.updated_at,
         count(*) over () as total
  from public.circuits c, q
  where c.deleted_at is null
    and (p_status is null or c.operational_status = p_status)
    and (q.pat is null
         or c.cfs ilike q.pat or c.do_number ilike q.pat or c.rfs_name ilike q.pat
         or exists (
           select 1 from public.circuit_segments s
           where s.circuit_id = c.id and s.deleted_at is null
             and (s.a_odf_text ilike q.pat or s.a_ne_text ilike q.pat or s.z_odf_text ilike q.pat
                  or s.z_ne_text ilike q.pat or s.observation ilike q.pat)))
  order by c.updated_at desc, c.id
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

create function public.import_apply_circuits(p_items jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  it jsonb; sg jsonb; cid uuid; sid uuid; ins boolean; rid text;
  n_ins int := 0; n_upd int := 0;
begin
  if not private.is_admin() then
    raise exception 'Somente administradores podem importar.';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.circuits as c
      (circuit_key, cfs, do_number, rfs_name, identification_status, operational_status, notes, attrs)
    values (it->>'key', it->>'cfs', it->>'do_number', it->>'rfs_name',
            it->>'identification_status', coalesce(it->>'operational_status', 'a_validar'),
            it->>'notes', coalesce(it->'attrs', '{}'::jsonb))
    on conflict (circuit_key) where deleted_at is null do update set
      cfs = coalesce(excluded.cfs, c.cfs),
      do_number = coalesce(excluded.do_number, c.do_number),
      rfs_name = coalesce(c.rfs_name, excluded.rfs_name),
      attrs = c.attrs || excluded.attrs,
      operational_status = case when excluded.operational_status = 'desconectado'
                                then 'desconectado' else c.operational_status end
    returning c.id, (xmax = 0) into cid, ins;
    if ins then n_ins := n_ins + 1; else n_upd := n_upd + 1; end if;

    for rid in select jsonb_array_elements_text(coalesce(it->'source_row_ids', '[]'::jsonb)) loop
      insert into public.source_links(source_row_id, entity_table, entity_id)
      values (rid::uuid, 'circuits', cid) on conflict do nothing;
    end loop;

    for sg in select * from jsonb_array_elements(coalesce(it->'segments', '[]'::jsonb)) loop
      insert into public.circuit_segments as s
        (circuit_id, seq, a_odf_text, a_ne_text, z_odf_text, z_ne_text, observation, flags, attrs)
      values (cid, (sg->>'seq')::int, sg->>'a_odf_text', sg->>'a_ne_text', sg->>'z_odf_text',
              sg->>'z_ne_text', sg->>'observation',
              coalesce(array(select jsonb_array_elements_text(coalesce(sg->'flags', '[]'::jsonb))), '{}'),
              coalesce(sg->'attrs', '{}'::jsonb))
      on conflict (circuit_id, seq) where deleted_at is null do update set
        a_odf_text = excluded.a_odf_text, a_ne_text = excluded.a_ne_text,
        z_odf_text = excluded.z_odf_text, z_ne_text = excluded.z_ne_text,
        observation = excluded.observation, flags = excluded.flags,
        attrs = s.attrs || excluded.attrs
      returning s.id into sid;
      for rid in select jsonb_array_elements_text(coalesce(sg->'source_row_ids', '[]'::jsonb)) loop
        insert into public.source_links(source_row_id, entity_table, entity_id)
        values (rid::uuid, 'circuit_segments', sid) on conflict do nothing;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('inserted', n_ins, 'updated', n_upd);
end $$;

revoke execute on function public.search_circuits(text, text, int, int) from public, anon;
revoke execute on function public.import_apply_circuits(jsonb) from public, anon;
grant execute on function public.search_circuits(text, text, int, int) to authenticated;
grant execute on function public.import_apply_circuits(jsonb) to authenticated;
