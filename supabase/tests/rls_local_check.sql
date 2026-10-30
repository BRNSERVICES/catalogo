\set ON_ERROR_STOP on
create temp table results(label text, expected text, got text, ok boolean);
create function pg_temp.run(label text, rl text, uid uuid, stmt text, expected text) returns void
language plpgsql as $f$
declare n int; got text;
begin
  begin
    execute format('set local role %I', rl);
    perform set_config('request.jwt.claim.sub', coalesce(uid::text,''), true);
    execute stmt;
    get diagnostics n = row_count;
    got := case when n > 0 then 'rows' else 'zero' end;
  exception when others then
    got := 'error';
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  insert into results values (label, expected, got, got = expected);
end $f$;

\o /dev/null
-- fixtures (como postgres, sem JWT)
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-0000000000a1','admin@t'),
 ('00000000-0000-0000-0000-0000000000e1','editor@t'),
 ('00000000-0000-0000-0000-0000000000c1','consulta@t'),
 ('00000000-0000-0000-0000-0000000000f1','inativo@t');
update profiles set role='administrador', active=true where email='admin@t';
update profiles set role='editor', active=true where email='editor@t';
update profiles set role='consulta', active=true where email='consulta@t';
insert into locations(id,name,kind,code) values ('00000000-0000-0000-0000-00000000f001','Local fictício de teste','tele_house','T1');
insert into circuits(circuit_key,cfs,do_number) values ('cfs:X|do:Y','X','Y');

select pg_temp.run('novo usuário nasce inativo', 'authenticated','00000000-0000-0000-0000-0000000000f1','select * from locations','zero');
select pg_temp.run('consulta lê localidades','authenticated','00000000-0000-0000-0000-0000000000c1','select * from locations','rows');
select pg_temp.run('consulta NÃO insere','authenticated','00000000-0000-0000-0000-0000000000c1',$$insert into locations(name) values('x')$$,'error');
select pg_temp.run('consulta NÃO atualiza','authenticated','00000000-0000-0000-0000-0000000000c1',$$update locations set notes='x'$$,'zero');
select pg_temp.run('consulta NÃO exclui','authenticated','00000000-0000-0000-0000-0000000000c1','delete from locations','zero');
select pg_temp.run('consulta NÃO se promove','authenticated','00000000-0000-0000-0000-0000000000c1',$$update profiles set role='administrador' where id='00000000-0000-0000-0000-0000000000c1'$$,'error');
select pg_temp.run('consulta NÃO lê auditoria','authenticated','00000000-0000-0000-0000-0000000000c1','select * from audit_logs','zero');
select pg_temp.run('editor insere localidade','authenticated','00000000-0000-0000-0000-0000000000e1',$$insert into locations(name,kind) values('Novo DC','dc')$$,'rows');
select pg_temp.run('editor atualiza','authenticated','00000000-0000-0000-0000-0000000000e1',$$update locations set notes='ok' where code='T1'$$,'rows');
select pg_temp.run('editor exclusão lógica','authenticated','00000000-0000-0000-0000-0000000000e1',$$update locations set deleted_at=now() where name='Novo DC'$$,'rows');
select pg_temp.run('editor NÃO exclui fisicamente','authenticated','00000000-0000-0000-0000-0000000000e1','delete from locations','zero');
select pg_temp.run('editor NÃO se promove','authenticated','00000000-0000-0000-0000-0000000000e1',$$update profiles set role='administrador' where id='00000000-0000-0000-0000-0000000000e1'$$,'error');
select pg_temp.run('editor NÃO escreve import_jobs','authenticated','00000000-0000-0000-0000-0000000000e1',$$insert into import_jobs(file_name,file_sha256) values('a','b')$$,'error');
select pg_temp.run('editor chave de circuito duplicada','authenticated','00000000-0000-0000-0000-0000000000e1',$$insert into circuits(circuit_key) values('cfs:X|do:Y')$$,'error');
select pg_temp.run('editor NÃO lê auditoria','authenticated','00000000-0000-0000-0000-0000000000e1','select * from audit_logs','zero');
select pg_temp.run('admin lê auditoria','authenticated','00000000-0000-0000-0000-0000000000a1','select * from audit_logs','rows');
select pg_temp.run('admin cria import_job','authenticated','00000000-0000-0000-0000-0000000000a1',$$insert into import_jobs(file_name,file_sha256) values('a','b')$$,'rows');
select pg_temp.run('admin ativa usuário','authenticated','00000000-0000-0000-0000-0000000000a1',$$update profiles set role='consulta', active=true where email='inativo@t'$$,'rows');
select pg_temp.run('admin exclui fisicamente','authenticated','00000000-0000-0000-0000-0000000000a1',$$delete from locations where name='Novo DC'$$,'rows');
select pg_temp.run('anônimo NÃO lê','anon',null,'select * from locations','error');
select pg_temp.run('auditoria NÃO é gravável por usuário','authenticated','00000000-0000-0000-0000-0000000000a1',$$insert into audit_logs(table_name,action) values('x','y')$$,'error');
select pg_temp.run('usuário NÃO chama função private diretamente (anon)','anon',null,'select private.is_admin()','error');

\o
select label, expected, got, case when ok then 'PASS' else 'FAIL' end as resultado from results order by 4 desc, 1;
