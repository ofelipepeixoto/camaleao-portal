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
