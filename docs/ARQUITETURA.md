# Catálogo Telecom — Arquitetura (Fase 2)

Status: esquema, RLS e funções testados em PostgreSQL 16 local com um stub de `auth`; frontend compila e o importador passou em 11 testes automatizados. **Ainda não** foi aplicado ao seu projeto Supabase nem publicado.

## Estrutura de diretórios prevista
```
catalogo-telecom/
├─ .github/workflows/deploy.yml     # build + GitHub Pages (Fase 5)
├─ docs/                            # este arquivo, README de operação
├─ supabase/
│  ├─ migrations/                   # 20261028000001_schema.sql, ..._rls.sql
│  └─ tests/                        # auth_stub.sql, rls_local_check.sql
├─ src/
│  ├─ components/  pages/  hooks/  services/  types/  lib/
│  └─ import/                       # leitura do .xlsx (SheetJS), parser de etiquetas, prévia
├─ .env.example   vite.config.ts   package.json
```
Rotas: `HashRouter` (compatível com GitHub Pages); `base` do Vite vem de variável de ambiente.

## Modelo de dados (resumo)
`locations` (+`location_aliases`) → `rooms` → `racks` → `equipment` (+`equipment_interfaces`) / `odfs` (+`odf_ports`) → `circuits` → `circuit_segments`; `connections` (cordão físico com dados da etiqueta); `code_catalog` (siglas FT/SR/PN/BJ/MD/SH/SL/DGO/CTA/EDGE/RR, significado em branco até confirmação); `import_jobs`, `import_source_rows`, `source_links`; `audit_logs`; `profiles`.

Decisões ligadas às suas respostas:
- **Circuit_Path é a base.** As demais abas entram como fonte secundária e divergências são sinalizadas em relação a ela.
- **Chave do circuito (`circuit_key`):** `cfs:<CFS>|do:<DO>` quando ambos existem; `cfs:<CFS>|do:-` se só há CFS; `do:<DO>|cfs:-` se só há DO; `hash:<sha256 do bloco>` quando CFS e DO são "NA". Esses últimos recebem `identification_status = 'sem_identificacao'` (aparecem no painel de qualidade).
- **Ordem do caminho não confirmada:** cada linha do bloco vira um `circuit_segments` com `seq` (ordem original) e `order_status = 'nao_confirmada'`. A tela de detalhe mostra "ordem conforme a planilha (não validada)" até alguém confirmar.
- **Texto original sempre preservado** (`*_text`, `port_text`) ao lado dos campos extraídos. "P:9/10" = par de fibras, guardado como `position_from`/`position_to`.
- **Localidades:** TLH1/TLH01/THL1 → mesma Tele House via `location_aliases`. DCs são criados a partir das grafias encontradas, com status `a_validar`; grafias como `DC1`, `DC01` e `DC.01` **não** são unificadas sem confirmação.
- **CTIABZAF** é tratado como equipamento (`equipment.name`), não como localidade.
- **Aba "TLH2 010110-00 2", MIRROR, Circuit_Import, Planilha1:** só dado bruto (`classification = 'apenas_bruto'`). **Blacklist:** circuitos com `operational_status = 'desconectado'` e a observação original preservada. "SEM ETIQUETA" e "VEM DA RUA" viram flag em `circuit_segments.flags`, nunca equipamento.

## Pipeline de importação (Fase 3)
1. Navegador lê o `.xlsx` (SheetJS), calcula SHA-256 do arquivo e cria um `import_job` em `previa`.
2. Todas as linhas vão para `import_source_rows` (aba, nº da linha, colunas com cabeçalho original, hash do conteúdo, mescladas).
3. Linhas são agrupadas em blocos (separados por linhas vazias) e interpretadas; mostra-se uma prévia com erros, avisos e possíveis duplicidades.
4. O administrador confirma; gravação por *upsert* em `circuit_key`; `source_links` liga cada registro às linhas de origem. O índice único de `file_sha256` confirmado impede reprocessar a mesma versão do arquivo.
5. Relatório de validação exportável (`import_jobs.validation_report`).

## Segurança (RLS)
- RLS ligado em **todas** as tabelas; `anon` sem acesso algum; funções de apoio em schema `private`.
- Leitura: qualquer perfil **ativo**. Escrita: editor e administrador. Exclusão física: só administrador (editores usam `deleted_at`). Importação: escrita só administrador. Auditoria: leitura só administrador, gravação só por trigger.
- **Novos usuários nascem inativos.** Um administrador ativa e define o papel. Recomenda-se também desligar o cadastro público no Supabase.
- **Primeiro administrador** (no SQL Editor do Supabase, sem expor chave no código):
  `update public.profiles set role='administrador', active=true where email='SEU_EMAIL';`
  (só funciona após o primeiro login/cadastro do e-mail; o trigger bloqueia a mesma operação vinda de usuários comuns.)

## Pendências reais
- Confirmar o significado das siglas (`code_catalog`) e se a ordem das linhas de um bloco é A→Z.
- Nome do repositório no GitHub (para o `base` do Vite).
- Aplicar as migrations num projeto Supabase real e rodar `supabase db advisors`.
- Leitura de etiquetas físicas (foto) é manual por ora; o formato de etiqueta (rack + painel + par + CFS/DO + data) está previsto em `connections`.
