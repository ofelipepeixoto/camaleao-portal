import type { Gateway, PortalRequest, DeliveryHistory, PresentDelivery, DecideDelivery } from './model';
import { button, el, field, modal } from './ui';

type Pending = {kind:'present';payload:PresentDelivery} | {kind:'decide';payload:DecideDelivery};
// Memory only: stable retry IDs/payloads never persist private real content locally.
const uncertain = new Map<string,Pending>();
export function clearDeliveryDrafts(): void { uncertain.clear(); }
const outcome = (value: string) => value === 'approved' ? 'Aprovada' : 'Ajustes solicitados';
const timestamp = (value: string) => new Date(value).toLocaleString('pt-BR');
export function openDeliveryDialog(context: {
  gateway: Gateway; request: PortalRequest; operator: boolean; valid: () => boolean;
  accessDenied: () => void; register: (dialog: HTMLDialogElement) => void;
}): void {
  const {gateway,request,operator,valid}=context;
  const key=`${request.organizationId}:${request.id}`;
  const body=el('div','dialog-body delivery-body');
  const feedback=el('p','form-feedback');feedback.setAttribute('role','alert');feedback.hidden=true;
  const success=el('p','notice');success.setAttribute('role','status');success.hidden=true;
  const content=el('div','delivery-content');
  body.append(feedback,success,content);
  const result=modal('Entregas e decisões',`Pedido ${request.protocol} · versões textuais, sem anexos.`,body);
  context.register(result.dialog);
  let history:DeliveryHistory={deliveries:[],decisions:[]};
  let pending=false;
  const alive=()=>valid() && result.dialog.isConnected;
  const showError=(message:string)=>{feedback.textContent=message;feedback.hidden=false;};
  const controls=()=>Array.from(result.dialog.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement>('button,input,textarea'));
  const lock=(value:boolean)=>{pending=value;for(const control of controls())control.disabled=value;};
  result.dialog.addEventListener('cancel',event=>{if(pending){event.preventDefault();event.stopImmediatePropagation();}}, {capture:true});
  const load=async()=>{
    content.replaceChildren(el('p','muted','Carregando versões…'));
    try {const next=await gateway.deliveryHistory(request.organizationId,request.id);if(!alive())return;history=next;draw();}
    catch(error){if(alive()){content.replaceChildren(button('Tentar carregar versões','button button-soft',()=>{void load();}));handle(error);}}
  };
  const handle=(error:unknown)=>{
    const code=String((error as {code?:string})?.code ?? '');
    if(code==='access_denied'){uncertain.delete(key);result.close();context.accessDenied();return;}
    showError(code==='version_conflict' ? 'A equipe apresentou uma nova versão. Confira o conteúdo atualizado antes de decidir.' :
      code==='conflict' ? 'Esta versão já recebeu uma decisão ou o envio mudou. Atualize e confira o histórico.' :
      code==='validation' ? 'Confira o texto e os limites indicados.' :
      'Não foi possível confirmar. Tente confirmar novamente: manteremos a mesma versão e o mesmo envio.');
  };
  const send=async(operation:Pending)=>{
    if(pending || !alive())return;
    uncertain.set(key,operation);feedback.hidden=true;success.hidden=true;lock(true);
    try {
      if(operation.kind==='present')await gateway.presentDelivery(request.organizationId,request.id,operation.payload);
      else await gateway.decideDelivery(request.organizationId,request.id,operation.payload);
      if(!alive())return;
      uncertain.delete(key);
      success.textContent=operation.kind==='present' ? 'Versão apresentada. O cliente pode revisar.' : 'Decisão registrada para esta versão.';
      success.hidden=false;
      await load();
    } catch(error) {
      if(!alive())return;
      const code=String((error as {code?:string})?.code ?? '');
      if(['version_conflict','conflict','validation','access_denied'].includes(code))uncertain.delete(key);
      handle(error);
      if(['version_conflict','conflict'].includes(code))await load();
      else draw();
    } finally {if(alive())lock(false);}
  };
  const draw=()=>{
    content.replaceChildren();
    const latest=history.deliveries[0];
    const decision=history.decisions.find(d=>d.deliveryId===latest?.id);
    if(latest){
      content.append(el('section','context-block',el('h3','',`Versão ${latest.version} · atual`),
        el('p','delivery-text',latest.content),el('p','muted delivery-hash',`SHA-256: ${latest.contentHash}`),
        el('p','muted',`Apresentada em ${timestamp(latest.createdAt)}`),
        el('strong','',decision ? `${outcome(decision.outcome)} · versão ${latest.version}` : 'Aguardando decisão do cliente')));
    }else content.append(el('p','muted','A equipe ainda não apresentou uma versão para este pedido.'));
    const retry=uncertain.get(key);
    if(retry){
      content.append(el('p','muted','Há um envio aguardando confirmação. Os dados e a versão foram preservados.'),
        button('Confirmar envio anterior','button button-primary',()=>{void send(retry);}));
    } else if(operator){
      const form=el('form','request-form');
      const text=el('textarea','input textarea');text.rows=6;text.required=true;text.minLength=10;text.maxLength=8000;
      const submit=button(latest?'Apresentar nova versão':'Apresentar versão','button button-primary');submit.type='submit';
      form.append(field('Conteúdo da entrega *',text,'Texto de 10 a 8.000 caracteres. Cada apresentação cria uma versão imutável; nenhum arquivo é enviado.'),submit);
      form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity() && text.value.trim().length>=10)void send({kind:'present',payload:{deliveryId:crypto.randomUUID(),expectedDeliveryId:latest?.id ?? null,content:text.value.trim()}});});
      content.append(form);
    } else if(latest && !decision){
      const controls=el('div','dialog-actions');
      const approve=button('Aprovar','button button-primary',()=>{void send({kind:'decide',payload:{decisionId:crypto.randomUUID(),deliveryId:latest.id,contentHash:latest.contentHash,outcome:'approved',adjustment:''}});});
      const form=el('form','request-form');form.hidden=true;
      const text=el('textarea','input textarea');text.rows=4;text.required=true;text.minLength=10;text.maxLength=2000;
      const submit=button('Enviar ajuste','button button-primary');submit.type='submit';
      form.append(field('O que precisa mudar? *',text,'Descreva o ajuste em 10 a 2.000 caracteres.'),submit);
      const changes=button('Pedir ajustes','button button-soft',()=>{form.hidden=false;approve.disabled=true;text.focus();});
      const cancel=button('Cancelar ajuste','button button-soft',()=>{form.hidden=true;approve.disabled=false;changes.focus();});form.append(cancel);
      form.addEventListener('submit',event=>{event.preventDefault();if(form.reportValidity() && text.value.trim().length>=10)void send({kind:'decide',payload:{decisionId:crypto.randomUUID(),deliveryId:latest.id,contentHash:latest.contentHash,outcome:'changes_requested',adjustment:text.value.trim()}});});
      controls.append(approve,changes);content.append(controls,form);
    }
    const list=el('ol','delivery-history');
    for(const version of history.deliveries){
      const decision=history.decisions.find(d=>d.deliveryId===version.id);
      list.append(el('li','context-block',el('h3','',`Versão ${version.version}${version.id===latest?.id ? ' · atual' : ' · anterior'}`),
        el('p','delivery-text',version.content),el('p','muted delivery-hash',`SHA-256: ${version.contentHash}`),
        el('p','muted',`Apresentada em ${timestamp(version.createdAt)}`),
        el('p','',decision ? `${outcome(decision.outcome)} em ${timestamp(decision.decidedAt)} · ator ${decision.actorId}` : 'Sem decisão registrada'),
        decision?.adjustment ? el('p','delivery-text',`Ajuste: ${decision.adjustment}`) : null,
        version.id!==latest?.id ? el('p','muted','Registro anterior; não é a decisão vigente.') : null));
    }
    content.append(el('section','',el('h3','','Histórico das versões'),list),button('Atualizar versões','text-button',()=>{if(!pending)void load();}));
    // Keep focus inside the modal when submitting buttons are replaced.
    const target=content.firstElementChild;
    if(target instanceof HTMLElement){target.tabIndex=-1;target.focus({preventScroll:true});}
  };
  void load();
}
