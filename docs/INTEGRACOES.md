# Plugins, acessos e runtime

Situação observada em 11/10/2026. Uma skill orienta a execução; não instala um
serviço nem concede credenciais ao portal. O navegador do cliente não herda as
conexões desta conversa.

| Recurso | Papel nesta entrega | Situação |
| --- | --- | --- |
| GitHub | Código, revisão, testes e continuidade Codex | Conta ofelipepeixoto acessível; novo projeto público autorizado |
| Supabase | Auth e persistência/isolamento | Plugin leu dois projetos e metadados; nenhuma mudança remota. Adapter/SQL preparados, conexão de runtime pendente |
| n8n + Codex | Triagem da fila com regras | Habilidade usada; JSONs manuais inativos testados localmente. API da instância não disponível nesta sessão |
| Engenharia IA | Contratos, integração, testes e limites | Aplicada; nenhuma API de IA necessária em A |
| Cibersegurança | RLS, sessão, XSS, permissões e privacidade | Revisão independente e casos negativos locais; não auditoria de produção |
| Camaleão Growth OS | Marca, briefing e experiência | Aplicada: nome textual, verde/preto/lime, decisões guiadas, sem promessas de resultado |
| Startup | Hipótese de utilidade e piloto | Aplicada; medir dois clientes completando pedido sem assistência, incompletude e tempo de triagem. Ainda sem métricas reais |
| Infra IA Soberana | Reuso da VPS, isolamento e continuidade | Aplicada ao desenho; não há inferência privada, GPU ou novos serviços instalados |
| Hostinger Connector | Hospedagem futura | Skills lidas. Ferramentas VPS/SSH não estão expostas nesta sessão; ferramentas AI Builder não substituem esse acesso |
| Sites / Stitch | Desenho e botão Área do cliente | Sem dependência de nova publicação Sites. Ajuste na conta do site apenas depois de homologar/publicar o portal |
| Composio | Criação do novo repositório quando falta operação nativa | Conexão GitHub ofelipepeixoto verificada; não integra apps de clientes ao portal |

Não instalamos todos os plugins como dependências do produto. Eles colaboram
no trabalho de criação; as integrações de produção ficam explicitamente medidas
por conexão, autenticação e teste real. Não há chamada paga planejada ou executada.

## Repositórios separados

camaleao-portal é o portal de pedidos da agência. camaleao-infra-portal é o
produto privado de diagnóstico/serviços de infraestrutura. radar-n8n-projetos
preserva plano e workflows históricos. Reutilizamos conceitos sem alterar esses
projetos nem publicar seus arquivos privados.
