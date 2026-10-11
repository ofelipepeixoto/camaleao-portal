# Portal Camaleão

**Agência Camaleão · projeto autoral de Carlos Felipe**

Um espaço para clientes enviarem pedidos com contexto e acompanharem a triagem
da equipe. A entrega A reúne login por convite, formulário guiado, protocolo,
lista, detalhes e histórico inicial. A equipe consulta as organizações em que
tem acesso concedido. Pedidos de peça social, campanha, site e automação.

**Estado: implementação da entrega A em revisão. Ainda não é um portal publicado
ou uma integração homologada com Supabase/n8n.** Veja [verificação](docs/VERIFICACAO.md).

## Comece por aqui

- [Escopo e critérios da entrega A](docs/ENTREGA-A.md)
- [Operação, homologação e continuidade no Codex](docs/OPERACAO.md)
- [Integrações e situação dos plugins](docs/INTEGRACOES.md)
- [Banco e testes de autorização](supabase/README.md)
- [Workflows manuais n8n](workflows/triagem-camaleao/README.md)

## Experimentar com dados fictícios

Node 24+. Depois de clonar a branch completa de implementação:

```bash
npm ci
npm run demo
```

Abra a URL local exibida. Escolha Cliente Aurora, Cliente Horizonte ou Equipe
Camaleão. Crie um pedido; saia e entre novamente para ver a persistência da
demonstração. O navegador guarda apenas dados fictícios; qualquer pessoa com
acesso a ele pode alterá-los. **Não inserir informações reais nesse modo.**
A demonstração não chama Supabase/n8n, não envia mensagens e não processa a fila.

Para o frontend real, copie .env.example para .env.local e configure somente
URL e chave **publicável**, mantendo VITE_DEMO_MODE=false. A migração, contas e
associações precisam de homologação antes de esse acesso funcionar. Não use
service_role/secret key ou senha do banco. Não há cadastro público na interface.

```bash
npm test
npm run build
npm run build:demo
npx playwright install chromium
npm run test:ui
```

Os testes de banco locais usam PostgreSQL WASM (PGlite). Os casos multi-conexão
usam PostgreSQL 17 no CI. Nenhum dos dois substitui Supabase Auth/PostgREST real.

## Arquitetura

Frontend estático TypeScript/Vite → Supabase Auth e Data API autenticada.
RPC grava pedido, job e evento na mesma transação. RLS restringe leitura por
associação ativa e sessão. A fila privada é processada manualmente pelo n8n,
com credencial de capacidade restrita, lease e até três tentativas.

O cliente recebe o resultado da triagem; não acessa o editor n8n nem configura
workflows. O endereço pretendido é portal.camaleaoweb3.com.br. Hospedagem, HTTPS
e DNS entram em outra entrega, preservando o site institucional.

## Origem e autoria

Implementação original orientada pela PR #6 de radar-n8n-projetos. Reaproveita
o conceito da triagem existente, com novo contrato e persistência. Não é fork,
nem cópia do produto privado de diagnóstico de infraestrutura Camaleão.

Copyright © 2026 Carlos Felipe / Agência Camaleão. A visibilidade pública não
concede uma licença open source; a licença de distribuição ainda será decidida.
Componentes externos preservam suas licenças e autoria. [Avisos](NOTICE.md).
