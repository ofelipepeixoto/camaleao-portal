# B1 — versões textuais e decisões

Base: feat/a4-triagem, commit 34ed29e7d743d8b25db07a95874d000365791440.
Plano consultado: PR #6 de radar-n8n-projetos, head
3c52dfea9b338388b0788d4db335425622e3908f, entrega B e T06/T07/T08.

A revisão focada verificou grants/RLS, associação explícita, sessão, serialização
por pedido, contrato RPC e interação com a fila. Não foi comprovado defeito na
entrega A nos casos executados. O status recebido/em_triagem e sua coluna version
pertencem à triagem: não representam versão ou aprovação de uma entrega.
B usa tabelas próprias para que finish_job não sobrescreva uma decisão. A1–A4
não são reescritas; B1 depende da revisão/integração de A4 e B2 depende de B1.

A migração nova é aditiva, sem aplicação remota. Entregas são textos imutáveis,
com versão por pedido e SHA-256 dos bytes UTF-8 do texto normalizado pelo servidor.
Não são anexos, arquivos privados nem comprovação de Storage (T11 fica pendente).
A equipe operator apresenta conteúdo com ID estável e versão anterior esperada.
Somente client ativo da organização decide. Resultado approved não aceita texto;
changes_requested exige descrição de 10–2000 caracteres.

Cada decisão registra organização, pedido, ator auth.uid(), versão, ID/hash exatos,
resultado, descrição e horário do banco. Um resultado terminal por versão:
replay com a mesma chave e conteúdo devolve a mesma decisão; outra chave ou
resultado conflitante não altera a decisão. Mesmo replay antigo é recusado depois
de nova apresentação. Decisões anteriores permanecem no histórico, mas deixam
de ser a aprovação vigente: sempre consultar a decisão da versão mais recente.

RPC pública invoker chama núcleo definer com search_path fixo e sem SQL dinâmico.
Grants permitem leitura RLS e RPC, sem INSERT/UPDATE/DELETE/TRUNCATE dos clientes.
Triggers impedem UPDATE/DELETE acidentais de registros imutáveis privilegiados.
Retenção/eliminação administrativa exige procedimento futuro revisado.
Lock do pedido serializa apresentação/decisão; sessão e associação ficam sob
FOR SHARE durante a operação. Expiração é conferida com clock_timestamp depois
da espera do pedido. Evento e registro são atômicos; falha de evento faz rollback.

Testes adicionados à suíte SQL existente: hash/ator/horário, imutabilidade, replay,
versão/hash antigos, ajustes, papéis/organizações, revogação e rollback das duas
operações. Casos multi-conexão: clique duplicado, decisões conflitantes,
apresentação versus decisão e apresentações concorrentes. Auth continua fixture.
PGlite: 56 passaram, nove ignorados (cinco A + quatro B concorrentes).
PostgreSQL 17.11 isolado: 65 passaram, zero falhas/ignorados.
Nenhuma conexão a Supabase/n8n real. CI desta mudança ainda não foi confirmada.

Revisão: migração → casos B de tests/db.test.mjs → este contrato. Reversão de UI
preserva as tabelas; após uso real não apagar registros para desfazer migração.
