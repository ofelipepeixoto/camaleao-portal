# Continuidade e homologação

## Agora: ver a entrega A

1. No GitHub, abrir a PR da camada de interface e selecionar sua branch (ou a
   branch completa da camada n8n). A main contém a fundação, não entrega integrada.
2. No chat do Codex, selecionar esse repositório e a branch completa.
3. Usar o prompt abaixo. A equipe/agente executa os comandos; o usuário não
   precisa colar senha, chave ou usar o terminal.

```text
Continue o Portal Camaleão. Leia AGENTS.md, README e docs/VERIFICACAO.md.
Confira as PRs abertas e sua ordem antes de editar. Mostre a entrega A em demo
com dados fictícios e revise acesso por organização, duplicatas e falhas.
Não faça merge sem revisão humana. Não ative workflow, aplique migração remota,
mude Auth compartilhado, publique ou altere VPS/DNS incidentalmente.
Complete o próximo incremento revisável e informe testes reais versus mocks.
```

## Homologar Supabase e n8n (entrega C)

Primeiro revisar a camada A e implementar versões/decisões da entrega B. Para
homologar A antecipadamente, manter escopo explícito de apenas pedidos/triagem.

1. Confirmar projeto existente por plugin; revisar Auth/OAAS/integradores, quotas,
   configurações Data API e impacto compartilhado, políticas e backup/restauração.
   Não escolher somente pelo nome ou assumir isolamento por prefixo.
2. Revisar a migração aditiva e advisors. Nunca executar local-fixtures em nuvem.
   Confirmar acesso a auth.sessions, JWT exp/session_id e revogação na versão real.
3. Aplicar apenas após ambiente e impacto autorizados. Convidar duas identidades
   de teste e operador; inserir associações administrativamente, por organização.
   A interface não oferece signup, mas configurações Auth do projeto compartilhado
   precisam de auditoria antes de liberar clientes reais.
4. Configurar somente URL e chave publicável no frontend. Testar login, RLS via
   Data API fora da UI, revogação, replay e falha atômica em sessões distintas.
5. Preparar credencial Postgres dedicada de mínimo privilégio para n8n que possa
   assumir camaleao_worker. Papel capability NOLOGIN por padrão; não usar postgres,
   service_role ou credencial WhatsApp. Segredo pelo cofre/credencial n8n, nunca chat.
6. Importar os JSONs como workflows novos e selecionar a credencial restrita
   somente nos dois nós Postgres. SSL obrigatório, sem ignorar problemas SSL.
   Versão real deve ser reconfirmada; referência de código usada foi n8n2.41.6.
7. Executar fixture e verificar saída fictícia. No fluxo de banco, liberar
   db_enabled conscientemente só no ambiente homologado e executar manualmente.
   Conferir pedido recebido→em_triagem, fila, replay e lease. Agenda continua ausente.
8. Validar permissões pela credencial real, retenção n8n sem payloads privados,
   timeout, pausa e recuperação. Resultados entram em docs/VERIFICACAO.md.

## Publicar depois da homologação (entrega D)

- Revalidar recursos/backup da VPS e configuração do proxy existente. Frontend
  estático em serviço isolado, sem montar volumes/segredos n8n. Não reinstalar.
- Conferir painel DNS autoritativo e IP real. Preparar somente o registro portal.
  Preservar @, www, MX e nameservers; não há IP ou servidor presumido neste repo.
- Build com VITE_DEMO_MODE=false; origem HTTPS e redirects de Auth exatos.
  Não publicar demo como piloto autenticado. URLs administrativas ficam internas.
- Revisar headers de segurança, CSP, cache (dados API privados sem cache
  compartilhado) e permissões em ambiente real antes de liberar.
- Depois, na conta Sites da agência, atualizar o site existente com botão
  Área do cliente apontando ao subdomínio. Não criar site novo nessa conta.

## Pausar e reverter

Parar somente execução do portal, colocar frontend em manutenção e preservar
fila/evidências. Voltar build de frontend anterior; corrigir SQL com migração
compatível. Não apagar volumes ou tabelas, restaurar toda VPS ou todo Supabase.
Backup só conta como recuperável depois de restaurado em destino de teste.
Dados fictícios: propor descarte deliberado até 30 dias após encerrar o piloto.
Definir retenção e responsável antes de inserir dados de clientes reais.
