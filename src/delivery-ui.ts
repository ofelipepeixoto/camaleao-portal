import type { Gateway, PortalRequest, DeliveryHistory, PresentDelivery, DecideDelivery, Delivery } from './model';
import { button, el, field, modal } from './ui';

type Pending = {kind:'present';payload:PresentDelivery} | {kind:'decide';payload:DecideDelivery};
type Draft = {kind:'present'|'adjust';versionId:string|null;text:string};
// Private text and stable retry IDs live only in this session's memory.
const uncertain = new Map<string,Pending>();
const drafts = new Map<string,Draft>();
export function clearDeliveryDrafts(): void { uncertain.clear(); drafts.clear(); }
const outcome = (value: string) => value === 'approved' ? 'Aprovada' : 'Ajustes solicitados';
const timestamp = (value: string) => new Date(value).toLocaleString('pt-BR');

export function openDeliveryDialog(context: {
  gateway: Gateway; request: PortalRequest; operator: boolean; organizationName: string;
  valid: () => boolean; accessDenied: () => void; register: (dialog: HTMLDialogElement) => void;
  demoNext?: () => void;
}): void {
  const {gateway,request,operator,valid}=context;
  const key=`${request.organizationId}:${request.id}`;
  const body=el('div','dialog-body delivery-body');
  const feedback=el('p','form-feedback');feedback.setAttribute('role','alert');feedback.hidden=true;
  const success=el('p','notice');success.setAttribute('role','status');success.hidden=true;
  const loading=el('p','muted');loading.setAttribute('role','status');
  const content=el('div','delivery-content');
  body.append(feedback,success,loading,content);
  const result=modal('Entregas e decisões',`${context.organizationName} · pedido ${request.protocol} · ${operator?'Equipe':'Cliente'}`,body);
  result.dialog.classList.add('delivery-dialog');
  context.register(result.dialog);
  let history:DeliveryHistory={deliveries:[],decisions:[]};
  let pending=false;
  let fetching=false;
  const alive=()=>valid() && result.dialog.isConnected;
  const showError=(message:string)=>{feedback.textContent=message;feedback.hidden=false;};
  const lock=()=>{
    for(const control of content.querySelectorAll<HTMLButtonElement|HTMLTextAreaElement>('button,textarea')) control.disabled=pending||fetching;
    const close=result.dialog.querySelector<HTMLButtonElement>('.dialog-header button');if(close)close.disabled=pending;
    content.setAttribute('aria-busy',String(pending||fetching));
  };
  result.dialog.addEventListener('cancel',event=>{if(pending){event.preventDefault();event.stopImmediatePropagation();}}, {capture:true});
  const handle=(error:unknown)=>{
    const code=String((error as {code?:string})?.code ?? '');
    if(code==='access_denied'){uncertain.delete(key);drafts.delete(key);result.close();context.accessDenied();return;}
    showError(code==='version_conflict' ? 'A equipe apresentou uma nova versão. Confira o conteúdo atualizado antes de decidir.' :
      code==='conflict' ? 'Esta versão já recebeu uma decisão ou o envio mudou. Confira o histórico atualizado.' :
      code==='validation' ? 'Confira o texto e os limites indicados. Seu rascunho foi preservado.' :
      'Não foi possível confirmar. Verifique o envio anterior antes de iniciar outro: seus dados foram preservados.');
  };
  const focus=(node:HTMLElement)=>{node.tabIndex=-1;node.focus({preventScroll:true});};
  const load=async()=>{
    if(fetching||!alive())return;
    fetching=true;loading.textContent='Carregando versões…';lock();
    content.replaceChildren();
    try {const next=await gateway.deliveryHistory(request.organizationId,request.id);if(!alive())return;history=next;draw();}
    catch(error){if(alive()){
      content.replaceChildren(button('Tentar carregar versões','button button-soft',()=>{feedback.hidden=true;void load();}));
      if(String((error as {code?:string})?.code??'')==='access_denied')handle(error);
      else showError('Não foi possível carregar as versões. Tente carregar novamente. Esta consulta não envia decisões.');
    }} finally {if(alive()){
      fetching=false;loading.textContent='';lock();
      if(!content.querySelector('.delivery-current'))content.querySelector('button')?.focus();
    }}
  };
  const send=async(operation:Pending)=>{
    if(pending||fetching||!alive())return;
    uncertain.set(key,operation);feedback.hidden=true;success.hidden=true;pending=true;lock();
    loading.textContent='Confirmando envio…';
    try {
      if(operation.kind==='present')await gateway.presentDelivery(request.organizationId,request.id,operation.payload);
      else await gateway.decideDelivery(request.organizationId,request.id,operation.payload);
      if(!alive())return;
      uncertain.delete(key);drafts.delete(key);
      success.textContent=operation.kind==='present' ? 'Versão apresentada. O cliente pode revisar.' : 'Decisão registrada para esta versão.';
      success.hidden=false;
      await load();
    } catch(error) {
      if(!alive())return;
      const code=String((error as {code?:string})?.code ?? '');
      if(['version_conflict','conflict','validation','access_denied'].includes(code))uncertain.delete(key);
      handle(error);
      if(!alive())return;
      if(['version_conflict','conflict'].includes(code))await load();else draw();
    } finally {if(alive()){pending=false;loading.textContent='';lock();}}
  };
  const technical=(version:Delivery)=>{
    const decision=history.decisions.find(d=>d.deliveryId===version.id);
    return el('details','delivery-technical',el('summary','','Identificação desta versão'),
      el('p','muted delivery-hash',`SHA-256: ${version.contentHash}`),
      el('p','muted delivery-hash',`Apresentada por: ${version.createdBy}`),
      decision?el('p','muted delivery-hash',`Decisão por: ${decision.actorId}`):null);
  };

  const draw=(edit=false)=>{
    content.replaceChildren();
    const latest=history.deliveries[0];
    const versionId=latest?.id??null;
    const decision=history.decisions.find(d=>d.deliveryId===latest?.id);
    const draft=drafts.get(key);
    const matching=draft?.versionId===versionId;
    const retry=uncertain.get(key);
    if(context.demoNext&&!decision){
      content.append(el('aside','demo-guide',el('h3','','Roteiro de 90 segundos · dados fictícios'),
        el('p','','Pedido e versão preparados para este exemplo. A triagem não foi executada.'),
        el('ol','demo-steps',el('li','','Leia o contexto e o texto da versão.'),
          el('li','','Aprove ou descreva um ajuste para esta versão.'),
          el('li','','Confira sua decisão e experimente criar outro pedido.'))));
    }
    if(context.demoNext&&decision)content.append(el('p','muted','Cenário fictício preparado. A triagem não foi executada.'));
    const briefing=el('details','delivery-brief',el('summary','','Contexto do pedido'),el('p','delivery-text',request.context));
    briefing.open=Boolean(context.demoNext);content.append(briefing);
    const current=el('section','delivery-current');
    if(latest){
      current.append(el('h3','',`Versão ${latest.version} · atual`),el('p','delivery-text',latest.content),
        el('p','muted',`Apresentada em ${timestamp(latest.createdAt)}`),
        el('strong','',decision ? `${outcome(decision.outcome)} · versão ${latest.version}` : `Sua próxima ação: ${operator?'aguardar a revisão do cliente':'revisar esta versão'}`));
      if(decision){
        current.append(el('p','muted',`Decisão registrada em ${timestamp(decision.decidedAt)}.`));
        if(decision.adjustment)current.append(el('p','delivery-text',`Ajuste: ${decision.adjustment}`));
        current.append(el('p','muted',decision.outcome==='approved' ? 'A decisão vale somente para este texto. Ela não publica nem envia conteúdo.' : 'A equipe pode apresentar outra versão. Ela precisará de uma nova decisão.'));
      }
      current.append(technical(latest));
    }else current.append(el('h3','','Ainda não há uma entrega'),el('p','muted',operator ?
      'Apresente o texto abaixo para que o cliente possa revisar a primeira versão.' : 'A equipe precisa apresentar uma versão. Você poderá aprovar ou pedir ajustes quando ela estiver disponível.'));
    content.append(current);
    if(draft&&!matching&&!retry){
      content.append(el('section','draft-notice',el('h3','','Rascunho de uma versão anterior'),
        el('p','','O conteúdo mudou. Seu texto foi preservado, mas não será enviado para a nova versão sem revisão.'),
        el('p','delivery-text',draft.text),
        operator||!decision ? button('Adaptar rascunho à versão atual','button button-soft',()=>{
          drafts.set(key,{...draft,versionId});draw(true);
        }):null,
        button('Descartar rascunho','text-button',()=>{drafts.delete(key);draw();})));
    }
    if(retry){
      const requested=retry.kind==='present' ? 'Apresentar uma versão' : retry.payload.outcome==='approved' ? 'Aprovar a versão revisada' : 'Pedir ajustes à versão revisada';
      content.append(el('section','draft-notice',el('h3','','Envio aguardando confirmação'),
        el('p','',`${requested}. O identificador e os dados originais serão reutilizados; nenhum novo envio será criado.`),
        retry.kind==='present' ? el('p','delivery-text',retry.payload.content) : retry.payload.adjustment ? el('p','delivery-text',retry.payload.adjustment) : null,
        button('Confirmar envio anterior','button button-primary',()=>{void send(retry);})));
    } else if(operator || (latest&&!decision)){
      const kind=operator?'present':'adjust';
      const form=el('form','request-form');
      form.hidden=!operator && !(matching && draft?.kind==='adjust');
      const text=el('textarea','input textarea');text.rows=operator?6:4;text.required=true;text.minLength=10;text.maxLength=operator?8000:2000;
      text.value=matching&&draft?.kind===kind ? draft.text : '';
      text.addEventListener('input',()=>{text.setCustomValidity('');drafts.set(key,{kind,versionId,text:text.value});});
      const label=operator?'Conteúdo da entrega *':'O que precisa mudar? *';
      form.append(field(label,text,operator ? 'Texto de 10 a 8.000 caracteres. A apresentação cria uma versão imutável, sem anexos.' : 'Indique o trecho e a mudança desejada. De 10 a 2.000 caracteres.'),
        el('p','muted','Rascunho mantido nesta sessão ao fechar ou atualizar. Sair, trocar de organização ou recarregar a página limpa o rascunho.'));
      const submit=button(operator?(latest?'Apresentar nova versão':'Apresentar versão'):'Enviar ajuste','button button-primary');submit.type='submit';
      form.append(submit);
      form.addEventListener('submit',event=>{
        event.preventDefault();text.setCustomValidity(text.value.trim().length<10?'Escreva pelo menos 10 caracteres, sem contar espaços nas pontas.':'');
        if(!form.reportValidity())return;
        if(operator)void send({kind:'present',payload:{deliveryId:crypto.randomUUID(),expectedDeliveryId:versionId,content:text.value.trim()}});
        else if(latest)void send({kind:'decide',payload:{decisionId:crypto.randomUUID(),deliveryId:latest.id,contentHash:latest.contentHash,outcome:'changes_requested',adjustment:text.value.trim()}});
      });
      if(!operator&&latest){
        const actions=el('div','dialog-actions');
        const confirmation=el('section','approval-review');confirmation.hidden=true;
        const confirm=button(`Confirmar aprovação da versão ${latest.version}`,'button button-primary',()=>{
          void send({kind:'decide',payload:{decisionId:crypto.randomUUID(),deliveryId:latest.id,contentHash:latest.contentHash,outcome:'approved',adjustment:''}});
        });
        const approve=button('Aprovar','button button-primary',()=>{
          actions.hidden=true;form.hidden=true;confirmation.hidden=false;focus(confirmation);
        });
        confirmation.append(el('h3','',`Aprovar versão ${latest.version} deste pedido?`),
          el('p','',`Sua decisão será registrada para o texto acima, no pedido ${request.protocol}. Não pode ser editada e não aprova versões futuras. Nenhum conteúdo será publicado.`),
          confirm,button('Voltar à revisão','button button-soft',()=>{confirmation.hidden=true;actions.hidden=false;approve.focus();}));
        const changes=button('Pedir ajustes','button button-soft',()=>{actions.hidden=true;form.hidden=false;text.focus();});
        actions.append(approve,changes);actions.hidden=!form.hidden;
        form.append(button('Voltar à revisão','button button-soft',()=>{form.hidden=true;actions.hidden=false;changes.focus();}));
        content.append(actions,confirmation);
      }
      content.append(form);
      if(edit){queueMicrotask(()=>{if(alive())text.focus();});}
    }
    const previous=history.deliveries.slice(1);
    const list=el('ol','delivery-history');
    for(const version of previous){
      const oldDecision=history.decisions.find(d=>d.deliveryId===version.id);
      list.append(el('li','context-block',el('h4','',`Versão ${version.version} · anterior`),
        el('p','delivery-text',version.content),
        el('p','muted',`Apresentada em ${timestamp(version.createdAt)}`),
        el('p','',oldDecision ? `${outcome(oldDecision.outcome)} em ${timestamp(oldDecision.decidedAt)}` : 'Sem decisão registrada'),
        oldDecision?.adjustment ? el('p','delivery-text',`Ajuste: ${oldDecision.adjustment}`) : null,
        el('p','muted','Registro anterior; não é a decisão vigente.'),technical(version)));
    }
    const historySection=el('details','delivery-previous',el('summary','',`Versões anteriores (${previous.length})`),
      previous.length?list:el('p','muted',latest ? 'Esta é a primeira versão. Não há versões anteriores.' : 'O histórico começa quando a equipe apresenta uma versão.'));
    content.append(historySection,button('Atualizar versões','text-button',()=>{if(!pending){feedback.hidden=true;void load();}}));
    if(context.demoNext&&decision){
      content.append(el('aside','demo-guide',el('h3','','Você registrou uma decisão fictícia'),
        el('p','','Agora experimente descrever uma necessidade em um novo pedido fictício. Para validar com um cliente, combine um caso de uso e confira os requisitos do piloto com a Camaleão pelo canal habitual.'),
        button('Criar outro pedido fictício','button button-primary',()=>{result.close();context.demoNext!();}),
        el('p','muted','O acesso real, o banco e a automação ainda precisam de homologação. Esta demo não contrata, cobra ou publica.')));
    }
    lock();focus(current);
  };
  void load();
}
