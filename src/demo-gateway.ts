import type { Gateway, Membership, PortalRequest, RequestPayload, User, Delivery, DeliveryDecision, DeliveryHistory, PresentDelivery, DecideDelivery } from './model.ts';
import { PortalError } from './supabase-gateway.ts';
import { validatePayload } from './validation.ts';

// Fictional browser-only demonstration. This is deliberately NOT an authorization boundary.
const ORGS = [{ organizationId: '10000000-0000-4000-8000-000000000001', organizationName: 'Estúdio Aurora' },
  { organizationId: '10000000-0000-4000-8000-000000000002', organizationName: 'Horizonte Café' }];
const KEY = 'camaleao-fictitious-demo-v1';
const USERS = ['aurora@exemplo.test', 'horizonte@exemplo.test', 'equipe@exemplo.test'];
export const DEMO_EXAMPLE_ID = '90000000-0000-4000-8000-000000000090';
export class DemoGateway implements Gateway {
  private current: User | null = null;
  private listeners = new Set<(u: User | null) => void>();
  private storage: Pick<Storage, 'getItem' | 'setItem'>;
  constructor(storage: Pick<Storage, 'getItem' | 'setItem'>) { this.storage = storage; }
  private rows(): PortalRequest[] { try { return JSON.parse(this.storage.getItem(KEY) ?? '[]'); } catch { return []; } }
  async init(): Promise<User | null> { return this.current; }
  async signIn(email: string, password: string): Promise<User> {
    const index = USERS.indexOf(email);
    if (index < 0 || password !== 'demo-only') throw new PortalError('Escolha uma conta fictícia da demonstração.', 'login');
    this.current = { id: `demo-user-${index}`, email };
    for (const listener of this.listeners) listener(this.current);
    return this.current;
  }
  async signOut(): Promise<void> { this.current = null; for (const listener of this.listeners) listener(null); }
  onSessionChanged(handler: (u: User | null) => void): () => void { this.listeners.add(handler); return () => this.listeners.delete(handler); }
  async memberships(): Promise<Membership[]> {
    if (!this.current) throw new PortalError('Entre em uma conta fictícia.', 'access_denied');
    const index = USERS.indexOf(this.current.email);
    return (index === 2 ? ORGS : [ORGS[index]]).map(o => ({ ...o, role: index === 2 ? 'operator' : 'client' }));
  }
  async listRequests(orgId: string): Promise<PortalRequest[]> {
    if (!(await this.memberships()).some(m => m.organizationId === orgId)) throw new PortalError('Conta fictícia de outra organização.', 'access_denied');
    return this.rows().filter(r => r.organizationId === orgId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  async createRequest(orgId: string, requestId: string, payload: RequestPayload): Promise<PortalRequest> {
    validatePayload(payload);
    await this.listRequests(orgId);
    const rows = this.rows();
    const existing = rows.find(r => r.id === requestId && r.organizationId === orgId);
    if (existing) {
      const same = Object.keys(payload).every(k => existing[k as keyof RequestPayload] === payload[k as keyof RequestPayload]);
      if (!same) throw new PortalError('Este envio já existe com informações diferentes.', 'conflict');
      return existing;
    }
    const now = new Date().toISOString();
    const row: PortalRequest = { ...payload, id: requestId, protocol: `CMP-${requestId.slice(0,8).toUpperCase()}`,
      organizationId: orgId, createdBy: this.current!.id, status: 'recebido', createdAt: now, updatedAt: now };
    this.storage.setItem(KEY, JSON.stringify([...rows, row]));
    return row;
  }
  private historyRows(): DeliveryHistory {
    try { return JSON.parse(this.storage.getItem('camaleao-fictitious-deliveries-v1') ?? '{"deliveries":[],"decisions":[]}'); }
    catch { return {deliveries:[],decisions:[]}; }
  }
  private saveHistory(rows: DeliveryHistory): void {
    this.storage.setItem('camaleao-fictitious-deliveries-v1',JSON.stringify(rows));
  }
  // Explicit, browser-only fixture. Never called through the production Gateway.
  // Reopening preserves decisions and other fictional requests; there is no silent reset.
  async prepareExample(): Promise<void> {
    const organizationId = ORGS[0].organizationId;
    const now = new Date().toISOString();
    const content = 'Estúdio Aurora · exemplo fictício\n\nSeu negócio merece uma apresentação clara. Criamos identidades visuais para pequenos negócios do bairro. Conheça nosso processo em uma conversa inicial.';
    const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const rows = this.rows();
    if (!rows.some(r => r.id === DEMO_EXAMPLE_ID)) {
      rows.push({id:DEMO_EXAMPLE_ID, protocol:'CMP-DEMO-90', organizationId, createdBy:'demo-user-0',
        category:'peca_social', goal:'divulgar_servico', channel:'linkedin', format:'post',
        context:'Cenário fictício preparado: apresentar o serviço de identidade visual do Estúdio Aurora a pequenos negócios do bairro, sem prometer resultados.',
        desiredDeadline:null, urgency:'normal', status:'recebido', createdAt:now, updatedAt:now});
      this.storage.setItem(KEY, JSON.stringify(rows));
    }
    const history = this.historyRows();
    if (!history.deliveries.some(d => d.requestId === DEMO_EXAMPLE_ID)) {
      history.deliveries.push({id:'91000000-0000-4000-8000-000000000090', organizationId,
        requestId:DEMO_EXAMPLE_ID, version:1, content, contentHash, createdBy:'demo-user-2', createdAt:now});
      this.saveHistory(history);
    }
  }
  private async deliveryAccess(orgId: string, requestId: string, role?: Membership['role']): Promise<void> {
    if (!(await this.memberships()).some(m => m.organizationId === orgId && (!role || m.role === role)) ||
      !this.rows().some(r => r.organizationId === orgId && r.id === requestId))
      throw new PortalError('Acesso fictício não disponível.', 'access_denied');
  }
  async deliveryHistory(orgId: string, requestId: string): Promise<DeliveryHistory> {
    await this.deliveryAccess(orgId,requestId);
    const all=this.historyRows();
    return {deliveries:all.deliveries.filter(d=>d.organizationId===orgId && d.requestId===requestId).sort((a,b)=>b.version-a.version),
      decisions:all.decisions.filter(d=>d.organizationId===orgId && d.requestId===requestId).sort((a,b)=>b.version-a.version)};
  }
  async presentDelivery(orgId: string, requestId: string, payload: PresentDelivery): Promise<Delivery> {
    await this.deliveryAccess(orgId,requestId,'operator');
    const content=payload.content.trim();
    if(content.length<10 || content.length>8000) throw new PortalError('Confira o conteúdo.', 'validation');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content))))
      .map(b=>b.toString(16).padStart(2,'0')).join('');
    await this.deliveryAccess(orgId,requestId,'operator');
    const all=this.historyRows();
    const latest=all.deliveries.filter(d=>d.requestId===requestId && d.organizationId===orgId).sort((a,b)=>b.version-a.version)[0];
    const existing=all.deliveries.find(d=>d.id===payload.deliveryId);
    if(existing) {
      if(existing.requestId!==requestId || existing.organizationId!==orgId || existing.createdBy!==this.current!.id || existing.content!==content || latest?.id!==existing.id)
        throw new PortalError('Apresentação conflitante.', 'conflict');
      return existing;
    }
    if((latest?.id ?? null)!==payload.expectedDeliveryId) throw new PortalError('Há nova versão.', 'version_conflict');
    const row: Delivery={id:payload.deliveryId,organizationId:orgId,requestId,version:(latest?.version ?? 0)+1,
      content,contentHash:hash,createdBy:this.current!.id,createdAt:new Date().toISOString()};
    all.deliveries.push(row);this.saveHistory(all);return row;
  }
  async decideDelivery(orgId: string, requestId: string, payload: DecideDelivery): Promise<DeliveryDecision> {
    await this.deliveryAccess(orgId,requestId,'client');
    const adjustment=payload.adjustment.trim();
    if(!['approved','changes_requested'].includes(payload.outcome) ||
      (payload.outcome==='approved' && adjustment!=='') || (payload.outcome==='changes_requested' && (adjustment.length<10 || adjustment.length>2000)))
      throw new PortalError('Confira o ajuste.', 'validation');
    const all=this.historyRows();
    const latest=all.deliveries.filter(d=>d.requestId===requestId && d.organizationId===orgId).sort((a,b)=>b.version-a.version)[0];
    if(!latest || latest.id!==payload.deliveryId || latest.contentHash!==payload.contentHash) throw new PortalError('Há nova versão.', 'version_conflict');
    const existing=all.decisions.find(d=>d.organizationId===orgId && (d as DeliveryDecision & {clientDecisionId:string}).clientDecisionId===payload.decisionId);
    if(existing) {
      if(existing.requestId!==requestId || existing.deliveryId!==payload.deliveryId || existing.actorId!==this.current!.id || existing.outcome!==payload.outcome || existing.adjustment!==adjustment)
        throw new PortalError('Decisão conflitante.', 'conflict');
      return existing;
    }
    if(all.decisions.some(d=>d.deliveryId===payload.deliveryId)) throw new PortalError('Versão já decidida.', 'conflict');
    const row: DeliveryDecision & {clientDecisionId:string}={id:crypto.randomUUID(),organizationId:orgId,requestId,
      deliveryId:payload.deliveryId,version:latest.version,contentHash:payload.contentHash,actorId:this.current!.id,
      outcome:payload.outcome,adjustment,decidedAt:new Date().toISOString(),clientDecisionId:payload.decisionId};
    all.decisions.push(row);this.saveHistory(all);return row;
  }

}
