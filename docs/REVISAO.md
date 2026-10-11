# Entrega A: revisão e continuidade

Implementação autoral preparada em 11/10/2026 a partir do plano aprovado na
PR #6 de radar-n8n-projetos. Esse plano e o portal privado de infraestrutura
foram consultados; seus repositórios não foram alterados nem copiados.

## Onde está o código

[Repositório público](https://github.com/ofelipepeixoto/camaleao-portal).
[Branch completa feat/a4-triagem](https://github.com/ofelipepeixoto/camaleao-portal/tree/feat/a4-triagem).
Main contém a fundação. As quatro PRs estão abertas como rascunho e sem merge.
As dependências são branches Git normais; não foi configurado um serviço de
stack nem presumida sua disponibilidade na conta.

| Ordem | PR | Objetivo | Base |
| --- | --- | --- | --- |
| 1 | [#1](https://github.com/ofelipepeixoto/camaleao-portal/pull/1) | Pedidos, acesso por organização e fila recuperável | main |
| 2 | [#2](https://github.com/ofelipepeixoto/camaleao-portal/pull/2) | Adapter autenticado, validação e contratos | feat/a1-dados |
| 3 | [#3](https://github.com/ofelipepeixoto/camaleao-portal/pull/3) | Interface de cliente/equipe, desktop e celular | feat/a2-acesso |
| 4 | [#4](https://github.com/ofelipepeixoto/camaleao-portal/pull/4) | Triagem n8n manual/inativa e registro final de evidências | feat/a3-interface |

Cada descrição explica os arquivos, testes, limites e como revisar. Os JSONs
da #4 são gerados; revisar regras e gerador antes dos arquivos derivados. A
migração na #1 é transacional e seus controles são testados juntos.

## Para visualizar sem conectar serviços

O Codex pode executar npm ci e npm run demo nessa branch. Os acessos Aurora,
Horizonte e Equipe são exemplos fictícios. [Desktop](previews/portal-desktop.png)
e [celular](previews/portal-mobile.png) mostram o resultado da demonstração.
Não colocar dados de clientes reais nesse modo.

## Próxima ação

Revisar #1, depois #2, #3 e #4. Correções ficam na camada responsável. Revisão
humana deve examinar isolamento, grants/RLS, transação/duplicatas, fila/leases,
privacidade, interface e procedimentos. Depois de integrar uma base, atualizar
as dependências sem force push e reconfirmar os checks antes de integrar a próxima.
Este documento não autoriza merge automático.

A CI confirmou 60 casos no commit de código registrado em
[VERIFICACAO.md](VERIFICACAO.md). Esses resultados não comprovam Supabase Auth
real, importação n8n, backups, hospedagem ou DNS. Não houve aplicação de migração
remota, ativação de workflow, mensagem, chamada paga ou implantação.

Os plugins orientaram a execução e permitiram operações GitHub/leitura Supabase.
O portal não herda suas credenciais; [INTEGRACOES.md](INTEGRACOES.md) separa
capacidade disponível e integração de runtime pendente. Hostinger VPS/SSH e
acesso específico à instância n8n não estão disponíveis nesta sessão.

[OPERACAO.md](OPERACAO.md) contém o prompt pronto para continuar no chat Codex
e a sequência de homologação/publicação no subdomínio, preservando o site atual.
