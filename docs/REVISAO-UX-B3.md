# B3 — primeiro resultado e revisão de versões

11/10/2026. Base auditada: B2 `3d2c321e4eeef06ed3c69aab9079a2995c794416`.
Branch incremental `feat/b3-demo-revisao`, dependente de `feat/b2-interface` / PR #6.
Nenhuma alteração nas PRs #1–#6 nem na demonstração já publicada.

## Resultado que esta camada permite validar

Um visitante experimenta uma decisão sobre uma entrega textual em um cenário
fictício preparado. Em seguida, pode criar seu próprio pedido fictício. Isso
permite demonstrar a proposta: contexto, versão revisada e decisão ficam juntos,
em vez de depender de mensagens espalhadas. Não comprova economia de tempo,
receita ou disposição de pagar. O público inicial proposto para o experimento é
um pequeno negócio que já contrata criação e precisa revisar entregas da agência.
Essa escolha é hipótese, não pesquisa com clientes realizada.

O cenário contém um pedido e uma versão textual, criados só após clicar em
**Revisar exemplo fictício**. O pedido continua `recebido`: a demo não inventa uma
execução de triagem. Reabrir preserva a decisão e os demais pedidos fictícios;
não há reset silencioso. A conta real mantém o login por convite. Não existe
fallback para demo quando um serviço real falha.

## Auditoria e antes/depois

| Achado e evidência | Prioridade / tarefa afetada | Correção e aceite |
| --- | --- | --- |
| Observado no navegador B2: chegar à revisão em um navegador vazio exigiu criar pedido, entrar como equipe, apresentar texto e voltar como cliente | P1 / mostrar primeiro valor | Uma ação abre o exemplo preparado, sem alternar contas. Só o preparo da demo foi abreviado; o fluxo real não ganhou integrações |
| Observado no navegador B2: título, conteúdo e hash da versão atual aparecem duas vezes | P2 / entender o que está sendo decidido | Versão atual única; versões anteriores em seção expansível e identificadores técnicos sob demanda |
| Observado no navegador B2: texto de ajuste some ao atualizar e ao fechar/reabrir | P1 / concluir ou retomar revisão | Rascunho em memória por organização/pedido/versão. Preservado ao atualizar/fechar e após erro de validação; limpo na troca de sessão/organização |
| Observado no código B2: `Aprovar` grava imediatamente uma decisão imutável | P1 / prevenir decisão involuntária | Confirmação mostra pedido, versão, consequência e limites. Voltar não grava. A aprovação continua vinculada ao ID/hash revisados |
| Observado na implementação intermediária B3: redimensionar a janela fazia o segundo clique atingir a confirmação | P1 / prevenção de erro | Altura estável da janela; regressão com duplo clique verifica zero decisões antes da confirmação e uma depois |
| Observado na revisão visual B3 a 320 px: botão longo de confirmação ultrapassava a janela | P1 / operar no celular | Texto do botão pode quebrar linha; teste confere largura e posição do botão no estado de confirmação |
| Observado na B2: abrir detalhes era obrigatório para alcançar entregas | P2 / encontrar revisão | Ação direta “Revisar entregas” por pedido. Janela mostra organização/papel e relê o histórico no contexto atual |
| Risco identificado por leitura: rascunhos de envio incerto continuavam em memória na troca de organização, apesar da descrição B2 | P2 / separar contextos | Limpeza explícita ao trocar/perder organização; nenhum vazamento entre organizações foi demonstrado |

Não foi feita entrevista, teste com usuário final ou auditoria jurídica. A auditoria
é de código, contratos sintéticos e tarefas executadas em Chromium local. O acesso
à URL publicada não foi confirmado pela ferramenta web; ela não é evidência desta
nova versão. Não foi alterado o Site nem feito deploy.

## Jornada e estados da tela prioritária

- Pedido → revisão direta → leitura da versão vigente → aprovação confirmada ou
  ajuste escrito → decisão registrada → histórico anterior ou próximo pedido.
- Sem versão: explica a dependência da equipe; operador vê o formulário da primeira
  entrega. A tela não oferece aprovação de um objeto ausente.
- Carregando: mensagem `role=status`, região ocupada e escrita indisponível. Pode
  fechar durante leitura; resposta atrasada não reabre a janela.
- Falha de leitura: informa que a consulta não enviou decisão, oferece recarregar
  e posiciona o foco nessa ação.
- Falha incerta de envio: preserva ID e payload originais. “Confirmar envio anterior”
  usa a idempotência existente do serviço; não fabrica outro identificador.
- Nova versão: mostra conflito, relê conteúdo e exige decisão deliberada. Ajuste
  antigo fica separado e só volta ao formulário após “Adaptar rascunho à versão
  atual”. Não transfere uma aprovação antiga.
- Rascunhos: texto privado real não vai para localStorage. Fechar a aba/recarregar,
  sair, trocar organização ou perder acesso elimina a memória local. Essa limitação
  aparece no formulário. O pedido inicial ainda preserva somente envios incertos,
  não rascunhos nunca enviados; isso permanece uma oportunidade posterior.
- Sucesso: identifica a versão decidida e sua consequência. Aprovar não publica,
  envia mensagem, cobra ou autoriza automaticamente outra versão.

Mantidos o verde escuro/lima, marca tipográfica e componentes Camaleão existentes.
O texto da entrega recebe prioridade; hash e atores continuam consultáveis em
“Identificação desta versão”. Nenhum logo novo, biblioteca ou dependência adicionada.

## Segurança e contratos preservados

A autorização real continua no SQL: RLS por associação/sessão, sem DML direto
para clientes, operador apresenta e cliente decide. As RPCs verificam a versão
mais recente e hash, serializam por pedido, validam expiração após espera de lock,
bloqueiam sobrescrita e mantêm idempotência. A interface envia os mesmos argumentos;
não escolhe ator, papel, horário do servidor ou número da versão gravada.

Revisados `supabase/migrations/20261011060000_portal_delivery_b.sql`, adapter B2,
UI, demo e testes de sessão/contexto. Nenhuma alteração de SQL, grant, RLS, quota,
regra financeira ou política de decisão. Texto continua renderizado por nós de
texto; os testes de conteúdo malicioso não criam HTML nem requisições externas.
Essas verificações não atestam Supabase Auth/PostgREST real ou segurança da demo:
qualquer pessoa com acesso ao navegador pode adulterar seus dados fictícios.

## Verificação local

| Execução | Resultado |
| --- | --- |
| Instalação limpa, lockfile preservado | `npm ci --ignore-scripts --cache /tmp/camaleao-b3-npm-cache`, 48 pacotes |
| Node/PGlite | 82 aprovados; nove casos de concorrência ignorados |
| Node/PostgreSQL 17.11 descartável | 91 aprovados; zero falhas/ignorados |
| TypeScript/build normal/build demo | Aprovados |
| Playwright/Chromium 154 | 19 aprovados (12 anteriores adaptados + sete novos), incluindo axe nos estados examinados |
| Matriz de data A4 | 20 cenários incluídos nos 91 testes, preservados |
| Gerador `--check`, auditoria npm, manifesto público | JSONs reproduzíveis; zero vulnerabilidades reportadas; 49 arquivos sem padrões detectados |
| Build demo estático servido localmente | Exemplo → ajuste → decisão → novo pedido, zero requisições externas e erros JavaScript |
| Separação dos builds | Entrada e cenário guiados presentes no demo e ausentes no JS do build normal |

A primeira instalação encontrou cache padrão não gravável. Foi repetida com
cache temporário por comando, sem mudar configuração do ambiente. A primeira
chamada de Playwright encontrou o servidor de reprodução B2 ainda aberto; ele
foi encerrado. O teste de duplo clique encontrou a falha descrita acima antes da
correção. Não se ocultaram falhas com mudança de contrato, exclusão de testes ou
relaxamento de asserções. A revisão visual adicionou a checagem do botão móvel.

As verificações de navegador cobrem entrada guiada, confirmação/cancelamento,
reabertura sem duplicar o exemplo, novo pedido, versão substituída, adaptação de
rascunho, validação, troca de conta/organização, resposta perdida, resposta atrasada,
estado vazio, leitura com falha, teclado e reflow a 320/390 px. Axe roda nos estados
examinados; não houve teste com leitor de tela, outros navegadores ou usuário final.
Não se declara conformidade WCAG completa.

Artefatos locais reproduzíveis em `artifacts/`: `before-review.png`, `baseline.json`,
`b3-desktop.png`, `b3-mobile.png`, `b3-entry.png` e `b3-static-smoke.json`. São evidências locais ignoradas pelo Git;
o código dos testes fica em `tests/ui/review.spec.ts`. CI e SHA publicados devem
ser confirmados na PR, não inferidos de uma execução antiga.

## Roteiro proposto de 90 segundos

`npm ci` e `npm run demo` nesta branch. Não é necessário Supabase ou n8n.

1. **0–15 s:** clicar “Revisar exemplo fictício”; dizer que o cenário foi preparado
   no navegador e que a triagem não executou.
2. **15–40 s:** ler o contexto e a versão textual, destacando organização e pedido.
3. **40–65 s:** escolher “Pedir ajustes” e escrever um trecho/mudança, ou abrir
   “Aprovar”, conferir consequência/versão e confirmar. Não sugerir a aprovação
   como resultado obrigatório do experimento.
4. **65–80 s:** mostrar a decisão vinculada à versão e a seção de versões anteriores.
   No primeiro exemplo ela estará vazia; não há histórico inventado.
5. **80–90 s:** clicar “Criar outro pedido fictício” e propor descrever um caso de uso
   semelhante do negócio, sem dados privados na demo.

90 segundos é uma hipótese de roteiro, não duração validada com pessoas. Próximo
experimento recomendado: observar cinco potenciais clientes, presencialmente ou
em chamada, sem publicar nem coletar automaticamente eventos. Denominador: quem
iniciou o exemplo; evento de primeiro valor: consegue explicar qual texto revisou
e registrar uma decisão sem ajuda. Anotar tempo, pedidos de ajuda e intenção de
experimentar um caso próprio. Se a maioria precisar de orientação para encontrar
versão/decisão, revisar esse trecho antes de ampliar recursos. Nenhuma meta de
conversão, ganho financeiro ou eficácia foi demonstrada.

## O que ainda impede um piloto comercial

A demonstração facilita uma conversa e validação de problema; não habilita uso
com dados reais. Ainda faltam revisão humana das PRs encadeadas e homologação C:
projeto autorizado, Auth/JWT/sessões, RLS/RPC via Data API, limites, backup com
restauração e execução manual do n8n com credencial restrita. Anexos privados
continuam ausentes. Definir escopo, responsável, prazo combinado, suporte e
condições comerciais fora da demo antes de propor piloto pago. Não há pagamento,
contratação, postagem LinkedIn, geração por IA ou integração de WhatsApp neste
incremento. Não se promete resolver essas etapas apenas com um deploy.

A oportunidade de mostrar versão/pendência já na lista foi avaliada: a consulta
atual lista pedidos; o histórico é lido por pedido e paginado. Não foram adicionadas
até 100 leituras de histórico por atualização. O atalho reduz um passo e consulta
os dados vigentes ao abrir. Um resumo autorizado e eficiente de versões/decisões
na lista é candidato posterior, se o experimento mostrar que ele é necessário.

## Referências e método

Skill aplicada: Sênior UX/UI & Interaction Design, módulos interação, humano–IA,
validação/acessibilidade, direção de arte, multiclientes e produto/GTM. Referências
oficiais W3C consultadas em 11/10/2026: [ordem de foco](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html),
[mensagens de estado](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
e [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). Orientaram foco
na recuperação, anúncio de carregamento e inspeção móvel; não são certificação.
