# Catálogo Telecom

Inventário de circuitos e infraestrutura de telecom. Frontend React + TypeScript + Vite (GitHub Pages), banco, login e permissões no Supabase (PostgreSQL + Auth + RLS).

**Versão 0.1 (teste):** login/logout/recuperação de senha, importação da planilha com prévia e relatório, lista/busca/paginação de circuitos, detalhe do circuito (caminho, origem na planilha, histórico para administradores) e edição de status/observações.
**Ainda não incluídos:** localidades, infraestrutura física (racks/ODFs/portas normalizados), painel de qualidade, exportação, gestão de usuários pela tela (use o SQL abaixo).

## 1. Supabase
1. No **SQL Editor**, execute em ordem os arquivos de `supabase/migrations/` (`..0001_schema.sql`, `..0002_rls.sql`, `..0003_functions.sql`). Cada um deve terminar sem erro.
2. **Authentication → Sign In / Providers:** desligue "Allow new users to sign up".
3. **Authentication → Users → Add user** (marque *Auto Confirm User*) para cada pessoa.
4. Libere o acesso (o perfil nasce **inativo**). Primeiro administrador:
   ```sql
   update public.profiles set role='administrador', active=true where email='SEU_EMAIL';
   ```
   Para os demais use `role='editor'` ou `'consulta'` e `active=true`.
5. **Authentication → URL Configuration:** *Site URL* e *Redirect URLs* = endereço do site publicado (`https://USUARIO.github.io/NOME_DO_REPO/`).

## 2. GitHub Pages
1. Envie estes arquivos ao repositório (branch `main`). Não envie planilhas nem `.env` (o `.gitignore` já bloqueia `.xlsx`).
2. **Settings → Secrets and variables → Actions → Variables:** crie
   - `VITE_SUPABASE_URL` = `https://SEU-PROJETO.supabase.co` (sem `/rest/v1/`)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = chave `sb_publishable_…`
   Nunca use `service_role` nem `sb_secret_…`.
3. **Settings → Pages → Source: GitHub Actions.** Cada push em `main` roda testes, gera o build e publica. O `base` do Vite é definido automaticamente pelo nome do repositório.

## 3. Primeira importação
Entre como administrador → **Importação** → escolha o `.xlsx` → revise abas, mapeamento, avisos (baixe o CSV) → **Confirmar**. Reimportar o mesmo arquivo é bloqueado; um arquivo novo atualiza circuitos pela chave (CFS+DO) sem duplicar.

## 4. Desenvolvimento local
```
cp .env.example .env.local   # preencha URL e chave pública
npm install
npm run dev      # http://localhost:5173
npm test         # testes do importador
npm run build
```
Testes de banco (precisam de PostgreSQL local): `supabase/tests/`.

## 5. Backup e recuperação
Plano gratuito do Supabase não garante backups diários. Periodicamente, em **Database → Backups** (se disponível) ou com `pg_dump` usando a string de conexão do projeto, exporte o banco. A planilha original continua sendo a fonte de dados brutos (`import_source_rows` guarda uma cópia fiel de cada linha).
