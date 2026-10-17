# Retomada de pedidos e links diretos

Incremento sobre PR #9, sem merge. Rascunhos ficam no sessionStorage da aba, separados por usuário e organização, por até 24 horas. Fechar formulário ou recarregar permite retomada; sair/trocar de conta ou perder acesso limpa os rascunhos da conta. A demo exige selecionar novamente a identidade depois de recarregar. Não é sincronização entre dispositivos nem autenticação segura.

Novo pedido oferece “Continuar rascunho” e descarte explícito. Um envio incerto preserva identificador e payload original para confirmação idempotente. Falha no armazenamento é mostrada, sem prometer salvamento.

Links: #/pedidos, #/historico, #/triagem. Funcionam após entrar; voltar/avançar alterna seções. Triagem exige operador. URLs não carregam textos, credenciais ou autorização, nem selecionam organização arbitrária. São links para seções, não para pedidos individuais. Em envio pendente, a tela não é abandonada pelo histórico.

Testes: unidade para isolamento, expiração, corrupção, storage bloqueado, identificador de retry e rotas. Build real e demo. Cenários de navegador acrescentados para CI; Chromium local segue indisponível.

Sem migração SQL, novo serviço, n8n ou chamada paga. Reversão: versão anterior do frontend; não apagar dados persistidos do servidor.

## Entregas aguardando revisão

A lista destaca a versão mais recente sem decisão correspondente e oferece “Ver entregas pendentes”. A decisão de uma versão antiga não remove o destaque de uma nova. Após fechar a revisão, os pedidos e indicadores são atualizados. Falha de consulta mostra “Não foi possível conferir”, sem converter erro em zero pendências.

No adapter real, a leitura usa tabelas existentes sob RLS, revalida associação e busca apenas metadados por organização e pelos até 100 pedidos carregados, com paginação e limite de 10 mil linhas por tabela. Não houve SQL remoto. A leitura não substitui a conferência e autorização ao aprovar. Concorrência pode deixar o resumo momentaneamente desatualizado; a decisão continua vinculada à versão/hash e validada pelo contrato existente.

## Aceite

- Retomar texto após Cancelar e recarga; descartar e sair da conta limpam o rascunho.
- Abrir #/historico antes do login; voltar/avançar funciona. Cliente não abre triagem por URL.
- Pedido sem entrega não é pendência; decisão antiga não aprova nova versão; organização alheia é recusada.
- CI valida cenários de navegador; homologação Supabase/n8n real e testes com participantes continuam pendentes.

## Evidências finais — 17/10/2026

- PR #10: https://github.com/ofelipepeixoto/camaleao-portal/pull/10, encadeada à #9, ambas sem merge nesta entrega.
- Código validado: 2c82f0a9195faa5ea6dabdfa00d567767f147fb3.
- Local: 89 testes aprovados, nove de PostgreSQL real ignorados; builds real/demo e git diff --check aprovados.
- CI: banco-e-contratos e interface aprovados em https://github.com/ofelipepeixoto/camaleao-portal/actions/runs/39074364213. Interface: 25 testes aprovados, incluindo retomada em 320px, rotas e destaque após decisão. A primeira rodada teve 24/25: o teste esperava login após navegação por fragmento; foi corrigido para testar sessão ativa e sessão encerrada.
- Publicação: versão 3 no mesmo site público https://demo-portal.camaleaoweb3.com.br. Fonte Sites: 1ff83141bc15e8e34b857bfd0b7f6952c2ce13d7; SOURCE.md referencia o commit GitHub do build.
- Navegador conectado: #/historico abriu Histórico após entrar; texto fictício retomado após Cancelar e após recarregar/reselecionar Cliente Aurora; aviso Continuar rascunho presente na lista; estado sem pendências exibido para as entregas já decididas do navegador.
- Chromium local continuou indisponível. Testes de navegador foram executados na CI; smoke adicional foi realizado na publicação. Isso não substitui testes com participantes reais nem homologação de Supabase/n8n/Storage.
