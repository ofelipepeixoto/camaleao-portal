# Auditoria UX/UI — Portal Camaleão

Data: 17/10/2026. Escopo: demo pública, jornada do cliente e da equipe, navegação e revisão de texto. Skill aplicada: Sênior UX/UI & Interaction Design.

## Diagnóstico

O fluxo principal funciona, mas a publicação estava atrás do código: a versão 1 do Sites usava B2 (3d2c321), enquanto main 6acae7a já continha B3 e o briefing editorial. A primeira correção é reaproveitar as melhorias existentes, sem criar uma interface concorrente.

Método: inspeção do código, teste da demo hospedada com pedido fictício CMP-22E32BD7 (criar → apresentar texto → aprovar), comparação entre fonte publicada e main e testes locais. Não houve pesquisa com clientes, teste com leitor de tela humano ou medição de conversão.

## Achados e correções

| Problema e evidência | Prioridade | Correção | Verificação |
| --- | --- | --- | --- |
| Demo B2 exibia login/senha apesar de oferecer identidades fictícias | Alta | Publicar entrada guiada B3 já revisada no GitHub | Abrir “Revisar exemplo fictício” sem credencial |
| Aprovação no site acontecia no primeiro clique, com hash e texto repetido em destaque | Alta | Reutilizar B3: confirmação contextual, detalhes técnicos e versões anteriores recolhidos | Aprovar → confirmar versão; sem publicação real |
| Revisão exigia abrir detalhes antes de chegar às entregas | Média | Reutilizar atalho B3 “Revisar entregas” em cada pedido | Lista → revisão diretamente |
| Contador da fila contava recebidos, mas a listagem não restringia o estado (src/main.ts) | Média | Fila mostra só recebidos; filtro fixo e vazio específico; todos permanecem em Meus pedidos | Comparar fila e lista com estados distintos |
| Trocar seção recriava a navegação e descartava o elemento focado | Média | Mover foco ao título da seção, com indicador visível | Histórico e fila recebem foco no h1 |
| Canal/formato vazios exibiam “Selecione, se aplicável” nos detalhes | Baixa | Exibir “Não indicado” | Criar sem opcionais e consultar detalhes |
| Contagem de busca mudava sem região de status | Média | role=status e anúncio polite | Inspeção semântica; leitor de tela humano pendente |

Código adicional desta entrega é pequeno: navegação, filtros, textos e testes. B3 é reaproveitado, não reimplementado. A fila continua sendo consulta de pedidos recebidos, não um painel dos jobs internos do n8n.

## Jornada e telas

| Tela | Papel | Ação principal | Próxima etapa |
| --- | --- | --- | --- |
| Entrada demo | Visitante | Revisar exemplo fictício | Revisão de conteúdo |
| Meus pedidos | Cliente/equipe | Novo pedido / Revisar entregas | Briefing ou versão atual |
| Novo pedido | Cliente/equipe | Enviar pedido | Protocolo e lista |
| Entregas e decisões | Cliente | Aprovar / Pedir ajustes | Confirmação vinculada à versão |
| Entregas e decisões | Equipe | Apresentar versão | Aguardar decisão do cliente |
| Histórico | Cliente/equipe | Ver pedido | Detalhes e revisão |
| Fila de triagem | Equipe | Consultar recebidos | Acompanhamento; automação separada |

A identidade visual verde/escura foi preservada. Conteúdo técnico fica progressivamente disponível. Papéis, associações, contratos de aprovação, SQL e workflows não foram modificados.

## Validação e limites

- npm test: 82 aprovados; nove ignorados por dependerem de PostgreSQL real.
- npm run build e npm run build:demo: aprovados.
- Dois testes de navegador adicionados para navegação/foco, campos opcionais e fila vazia.
- A primeira execução da suíte de navegador não iniciou os cenários: Chromium ausente no ambiente. Não é evidência de defeito da interface. Resultado da tentativa de recuperação será registrado abaixo.
- git diff --check: aprovado.
- Não houve migração remota, ativação n8n, IA paga, envio de mensagens ou uso de dados reais.

Referências consultadas: WCAG 2.2, [ordem de foco](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html) e [mensagens de estado](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), em 17/10/2026. As correções usam essas orientações; não constituem certificação de conformidade integral.

## Próximo incremento recomendado

1. Preservar o rascunho de um novo pedido ao fechar a janela; hoje a preservação de B3 cobre entregas/ajustes durante a sessão, não todo briefing antes do envio.
2. Acrescentar navegação por URL e retorno do navegador, respeitando organização e sessão. Hoje as seções são estado interno, sem links diretos.
3. Separar “aguardando sua revisão” dos estados de triagem, com consulta autorizada em lote antes de introduzir novos contadores; não inferir aprovação a partir do status do pedido.
4. Validar com três a cinco pessoas convidadas, incluindo uso por celular: localizar pedido, revisar versão, pedir ajuste, retomar. Medir conclusão e erros; ainda não há ganho percentual demonstrado.
5. Homologar Auth, Supabase, n8n e Storage antes de usar dados de clientes. A demo continua local e fictícia.

## Roteiro de aceite humano

Abrir a demo → Revisar exemplo fictício → ler contexto e texto → Pedir ajustes → voltar à revisão → Aprovar → conferir pedido/versão → confirmar. Fechar e reabrir para conferir decisão preservada. Criar um pedido sem canal/formato; abrir detalhes e conferir “Não indicado”. Entrar como equipe e conferir filtro da fila; voltar a Meus pedidos para consultar todos.

### Resultado da recuperação do navegador local

O download do Chromium falhou. A suíte Playwright local permanece não executada; seus cenários não foram contados como aprovados. A CI remota e a inspeção da demo hospedada serão reportadas separadamente.
