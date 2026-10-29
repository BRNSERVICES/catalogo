# Catálogo Telecom

Aplicação web inicial para consulta do catálogo de infraestrutura e circuitos de telecomunicações, conectada ao Supabase.

## Estado desta versão

- Login por Supabase Auth (não há cadastro público na interface).
- Verificação de perfil ativo e papel de acesso.
- Painel com contagens de circuitos, localidades, equipamentos e circuitos a validar.
- Consulta, busca, filtro por status e detalhes básicos dos circuitos.
- Importação Excel e gestão de infraestrutura ainda não implementadas.

## Requisitos

- Node.js 20 ou superior recomendado.
- Projeto Supabase com as migrações do Catálogo Telecom aplicadas.
- Usuário criado no Supabase Auth e perfil ativado por administrador.

## Executar localmente

1. Instale Node.js.
2. Na pasta do projeto, copie `.env.example` para `.env.local`.
3. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com a URL do projeto e a chave pública (anon/publishable) do Supabase.
4. Instale dependências e inicie:

```bash
npm install
npm run dev
```

## Publicação no GitHub Pages

O repositório deve conter os arquivos-fonte deste projeto na raiz. O arquivo `.github/workflows/deploy.yml` publica o build. Em Settings → Pages, selecione **GitHub Actions** como origem.

No GitHub, adicione os repository variables `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em Settings → Secrets and variables → Actions → Variables. Adicione `VITE_BASE` com `/catalogo/` se o nome do repositório for `catalogo`. Se o nome for diferente, ajuste para `/<nome-do-repositorio>/`.

No Supabase, em Authentication → URL Configuration, inclua a URL pública do GitHub Pages em Site URL/Redirect URLs conforme necessário. Nunca coloque a chave `service_role` no frontend ou no GitHub.

## Segurança

O frontend é apenas a interface. As políticas RLS do Supabase são a barreira real de autorização. Não remova RLS para corrigir erros de tela. Confirme no SQL Editor que o gatilho `profiles_guard` existe antes de liberar usuários.
