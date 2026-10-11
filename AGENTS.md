# Portal Camaleão — instruções de trabalho

Projeto autoral de Carlos Felipe / Agência Camaleão, conta GitHub `ofelipepeixoto`.
Responda em português simples. Leia README, docs/ENTREGA-A.md e docs/OPERACAO.md.

## Entregas revisáveis

Planeje → implemente uma camada → teste → revise → prepare a seguinte.
Use PRs pequenas, com objetivo único, base e dependências explícitas. Código, testes
e documentação da camada ficam juntos. Marque arquivos gerados e seu gerador.
Autorrevisão e CI não substituem revisão humana. Merge requer revisão e autorização
aplicáveis. Nunca force push nem enfraqueça proteções para facilitar integração.

## Escopo atual

Entrega A: login, pedido guiado, persistência, leitura por organização e triagem
manual. Aprovações de entregas e uploads são etapas seguintes. Não acrescentar
IA paga, cadastros públicos ou novas plataformas por conveniência.
O modo demo é fictício, explicitamente sinalizado e não tem autenticação segura.
Não usar demo como fallback de uma conexão real com falha.

## Serviços existentes

O n8n já existe na VPS; não reinstalar. A conta tem dois projetos Supabase;
não criar terceiro nem trocar o banco interno do n8n. Não presumir SSH, API n8n
ou capacidade a partir de um conector. Manter o site institucional existente.
O portal de infraestrutura privado é outro produto; não publicar seu conteúdo.

## Dados e autorização

SQL aditivo revisado, sem alterações remotas durante testes locais. Fixtures de
auth.users/auth.sessions são apenas contratos de teste: nunca rodar em Supabase.
DB_TEST_URL aceita somente loopback e banco vazio com prefixo camaleao_test_.
RLS/grants são controles reais; rótulos na UI e prefixos de tabela não são.
Nunca confiar em user_metadata para autorização. Cliente não muda papel/status.
Não colocar tokens, service_role, senhas, dados reais ou dumps no repositório.
Frontend aceita apenas URL pública e chave publicável; n8n usa credencial restrita.

## Workflows e verificação

Workflows versionados manuais, inativos, sem pinData/credentials/cron/webhook.
Leia o README de cada workflow. Edite rules.mjs/gerador e reproduza os JSONs.
Execute npm test, npm run build, npm run build:demo e npm run test:ui conforme
a camada. Testes SQL multi-conexão exigem PostgreSQL real no CI/ambiente isolado.
Informe separadamente testes locais, mocks, CI, importação e execução real.
Não ativar workflows ou publicar como efeito incidental do commit.

## Operação futura

Confirmar projeto Supabase, Auth compartilhado, quotas, sessões, permissões, backup
e restauração antes de homologar. Não alterar DNS/VPS/Sites na entrega A.
Preservar volumes/chave n8n. Nunca docker compose down -v. Reversão de frontend
preserva dados; SQL real deve ser corrigido por migração revisada.
