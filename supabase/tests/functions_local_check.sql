\set ON_ERROR_STOP off
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','admin@t'),('00000000-0000-0000-0000-0000000000e1','editor@t');
update profiles set role='administrador', active=true where email='admin@t';
update profiles set role='editor', active=true where email='editor@t';
insert into import_jobs(id,file_name,file_sha256) values ('00000000-0000-0000-0000-00000000aaaa','t.xlsx','abc');
insert into import_source_rows(id,job_id,sheet_name,row_number,cells,content_hash) values
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000aaaa','S',5,'[]','h1');
\echo === admin importa 2x (idempotência)
begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',true);
select public.import_apply_circuits('[{"key":"cfs:1|do:2","cfs":"1","do_number":"2","identification_status":"identificado","operational_status":"a_validar","attrs":{"x":1},"source_row_ids":["00000000-0000-0000-0000-0000000000b1"],"segments":[{"seq":1,"a_odf_text":"TLH01 006-005 FT01 P:9/10","observation":null,"flags":["sem_etiqueta"],"attrs":{},"source_row_ids":["00000000-0000-0000-0000-0000000000b1"]}]}]'::jsonb);
select public.import_apply_circuits('[{"key":"cfs:1|do:2","cfs":"1","do_number":"2","identification_status":"identificado","operational_status":"a_validar","attrs":{"x":2},"segments":[{"seq":1,"a_odf_text":"TLH01 006-005 FT01 P:9/10","flags":[],"attrs":{}}]}]'::jsonb);
commit;
select 'circuitos='||count(*) from circuits; select 'segmentos='||count(*) from circuit_segments; select 'links='||count(*) from source_links;
\echo === editor NÃO importa
begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',true);
select public.import_apply_circuits('[]'::jsonb);
rollback;
\echo === busca por trecho de segmento e paginação (editor)
begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000e1',true);
select id is not null as achou, total from public.search_circuits('FT01 P:9', null, 25, 0);
select count(*) as sem_resultado from public.search_circuits('naoexiste%', null, 25, 0);
select count(*) as coringa_literal from public.search_circuits('%', null, 25, 0);
commit;
