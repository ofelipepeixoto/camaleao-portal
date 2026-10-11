# Autoria e componentes

Código do Portal Camaleão preparado para Carlos Felipe / Agência Camaleão.
Copyright © 2026 Carlos Felipe. Direitos de distribuição do código autoral
reservados até definição explícita da licença; repositório público não é licença.

Dependências são instaladas pelo gerenciador, com versões e integridade no lock:

| Componente | Uso | Licença declarada pelo pacote |
| --- | --- | --- |
| @supabase/supabase-js e clientes Supabase | Auth/Data API | MIT |
| Vite | Build estático | MIT |
| TypeScript | Verificação de tipos | Apache-2.0 |
| Playwright | Testes de navegador | Apache-2.0 |
| axe-core / axe-core Playwright | Verificação automatizada de acessibilidade | MPL-2.0 / MPL-2.0 |
| PGlite | PostgreSQL WASM de teste | Apache-2.0 |
| node-postgres (pg) | PostgreSQL de teste | MIT |

Consulte as licenças nos pacotes instalados e os avisos das dependências
transitivas ao redistribuir builds. Não incorporamos o runtime n8n nem a plataforma
Supabase neste repositório. A licença n8n deve ser verificada para o uso concreto;
nesta arquitetura apenas a equipe cria e opera os workflows de triagem.

Fonte de n8n consultada em 11/10/2026:
https://docs.n8n.io/n8n-community-license/community-license/license-faq

Orientações de briefing e roteiro editorial: adaptação seletiva de Marketing Skills, Copyright (c) 2025 Corey Haines (MIT). Ver third-party/marketingskills-LICENSE.txt e docs/MARKETING-PILOTO.md para origem e escopo.
