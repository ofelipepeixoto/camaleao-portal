import type { SupabaseClient } from '@supabase/supabase-js';
import type { Gateway, Membership, PortalRequest, RequestPayload, User, Delivery, DeliveryDecision, DeliveryHistory, PresentDelivery, DecideDelivery } from './model.ts';
import { validatePayload } from './validation.ts';

export class PortalError extends Error {
  public code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}
function fail(error: { code?: string; status?: number } | null): never {
  if (error?.code === '40001') throw new PortalError('Há uma nova versão. Confira o conteúdo atualizado antes de decidir.', 'version_conflict');
  if (error?.code === '23505') throw new PortalError('Este envio já existe com informações diferentes. Atualize a lista antes de tentar novamente.', 'conflict');
  if (error?.code === '42501' || error?.status === 401 || error?.status === 403) throw new PortalError('Seu acesso mudou ou expirou. Entre novamente.', 'access_denied');
  if (error?.code === '54000') throw new PortalError('O limite de pedidos foi atingido. Fale com a equipe.', 'limit');
  if (error?.code === '22023') throw new PortalError('Confira os campos do pedido e tente novamente.', 'validation');
  throw new PortalError('Não foi possível concluir. Confira sua conexão e tente novamente; o protocolo do envio será preservado.', 'unavailable');
}
export function fromRow(r: Record<string, unknown>): PortalRequest {
  return {
    id: String(r.id), protocol: String(r.protocol), organizationId: String(r.organization_id),
    createdBy: String(r.created_by), category: r.category as PortalRequest['category'],
    goal: String(r.goal), channel: String(r.channel ?? ''), format: String(r.format ?? ''),
    context: String(r.context), desiredDeadline: r.desired_deadline ? String(r.desired_deadline) : null,
    urgency: r.urgency as PortalRequest['urgency'], status: r.status as PortalRequest['status'],
    createdAt: String(r.created_at), updatedAt: String(r.updated_at),
  };
}
function validDeliveryRow(r: Record<string, unknown>): boolean {
  return ['id','organization_id','request_id','created_by','created_at','content','content_hash'].every(k => typeof r[k] === 'string') &&
    typeof r.version === 'number' && Number.isInteger(r.version) && r.version > 0 && /^[a-f0-9]{64}$/.test(String(r.content_hash));
}
export function deliveryFromRow(r: Record<string, unknown>): Delivery {
  if (!validDeliveryRow(r)) throw new PortalError('Resposta inesperada. Atualize para conferir a versão.', 'unavailable');
  return { id: String(r.id), organizationId: String(r.organization_id), requestId: String(r.request_id),
    version: Number(r.version), content: String(r.content), contentHash: String(r.content_hash),
    createdBy: String(r.created_by), createdAt: String(r.created_at) };
}
export function decisionFromRow(r: Record<string, unknown>): DeliveryDecision {
  if (!['id','organization_id','request_id','delivery_id','content_hash','actor_id','adjustment','decided_at'].every(k => typeof r[k] === 'string') ||
    typeof r.version !== 'number' || !Number.isInteger(r.version) || r.version < 1 || !/^[a-f0-9]{64}$/.test(String(r.content_hash)) ||
    !['approved','changes_requested'].includes(String(r.outcome)))
    throw new PortalError('Resposta inesperada. Atualize para conferir a decisão.', 'unavailable');
  return { id: String(r.id), organizationId: String(r.organization_id), requestId: String(r.request_id),
    deliveryId: String(r.delivery_id), contentHash: String(r.content_hash), version: Number(r.version),
    actorId: String(r.actor_id), outcome: r.outcome as DeliveryDecision['outcome'],
    adjustment: String(r.adjustment), decidedAt: String(r.decided_at) };
}
function rpcRow(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new PortalError('Resposta inesperada. Atualize para conferir o resultado.', 'unavailable');
  return data as Record<string, unknown>;
}
export class SupabaseGateway implements Gateway {
  private client: SupabaseClient;
  constructor(client: SupabaseClient) { this.client = client; }
  async init(): Promise<User | null> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? '' };
  }
  async signIn(email: string, password: string): Promise<User> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new PortalError('Não foi possível entrar. Confira seu email e sua senha.', 'login');
    return { id: data.user.id, email: data.user.email ?? '' };
  }
  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) { await this.client.auth.signOut({ scope: 'local' }); throw new PortalError('O acesso foi removido deste navegador. Não foi possível confirmar a saída nos outros dispositivos.', 'logout'); }
  }
  onSessionChanged(handler: (user: User | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      // Never await Supabase calls inside this callback: the SDK holds an auth lock.
      queueMicrotask(() => handler(session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null));
    });
    return () => data.subscription.unsubscribe();
  }
  private async user(): Promise<User> {
    const user = await this.init();
    if (!user) throw new PortalError('Seu acesso expirou. Entre novamente.', 'access_denied');
    return user;
  }
  async memberships(): Promise<Membership[]> {
    const user = await this.user();
    const { data, error } = await this.client.from('camaleao_memberships')
      .select('organization_id,role,camaleao_organizations(name)').eq('user_id', user.id).eq('active', true);
    if (error) fail(error);
    return (data ?? []).map(row => ({ organizationId: row.organization_id, role: row.role,
      organizationName: String((row.camaleao_organizations as unknown as {name: string} | null)?.name ?? 'Organização') }));
  }
  async listRequests(orgId: string): Promise<PortalRequest[]> {
    await this.user();
    const memberships = await this.memberships();
    if (!memberships.some(m => m.organizationId === orgId)) throw new PortalError('Seu acesso a esta organização mudou.', 'access_denied');
    const { data, error } = await this.client.from('camaleao_requests').select('*')
      .eq('organization_id', orgId).order('created_at', { ascending: false }).limit(100);
    if (error) fail(error);
    return (data ?? []).map(fromRow);
  }
  async createRequest(orgId: string, requestId: string, payload: RequestPayload): Promise<PortalRequest> {
    validatePayload(payload);
    await this.user();
    const { data, error } = await this.client.rpc('camaleao_create_request', {
      p_organization_id: orgId, p_request_id: requestId,
      p_payload: { category: payload.category, goal: payload.goal, channel: payload.channel,
        format: payload.format, context: payload.context, desired_deadline: payload.desiredDeadline, urgency: payload.urgency },
    });
    if (error) fail(error);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new PortalError('Resposta inesperada. Atualize a lista para conferir o pedido.', 'unavailable');
    return fromRow(data);
  }
  private async deliveryAccess(orgId: string, role?: Membership['role']): Promise<void> {
    const allowed = await this.memberships();
    if (!allowed.some(m => m.organizationId === orgId && (!role || m.role === role)))
      throw new PortalError('Seu acesso a esta organização mudou.', 'access_denied');
  }
  async deliveryHistory(orgId: string, requestId: string): Promise<DeliveryHistory> {
    await this.deliveryAccess(orgId);
    // All history is paginated; do not truncate the latest version or older decisions.
    const read = async (table: string): Promise<Record<string, unknown>[]> => {
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += 100) {
        const {data,error} = await this.client.from(table).select('*')
          .eq('organization_id',orgId).eq('request_id',requestId)
          .order('version',{ascending:false}).range(offset,offset+99);
        if (error) fail(error);
        rows.push(...(data ?? []));
        if ((data ?? []).length < 100) return rows;
      }
    };
    const deliveries = await read('camaleao_deliveries');
    const decisions = await read('camaleao_decisions');
    return {deliveries:deliveries.map(deliveryFromRow),decisions:decisions.map(decisionFromRow)};
  }
  async presentDelivery(orgId: string, requestId: string, payload: PresentDelivery): Promise<Delivery> {
    if (payload.content.trim().length < 10 || payload.content.trim().length > 8000)
      throw new PortalError('Descreva a entrega em 10 a 8.000 caracteres.', 'validation');
    await this.deliveryAccess(orgId,'operator');
    const {data,error}=await this.client.rpc('camaleao_present_delivery',{
      p_organization_id:orgId,p_request_id:requestId,p_delivery_id:payload.deliveryId,
      p_expected_delivery_id:payload.expectedDeliveryId,p_content:payload.content,
    });
    if(error) fail(error);
    return deliveryFromRow(rpcRow(data));
  }
  async decideDelivery(orgId: string, requestId: string, payload: DecideDelivery): Promise<DeliveryDecision> {
    if (!['approved','changes_requested'].includes(payload.outcome) ||
      (payload.outcome === 'approved' && payload.adjustment.trim() !== '') ||
      (payload.outcome === 'changes_requested' && (payload.adjustment.trim().length < 10 || payload.adjustment.trim().length > 2000)))
      throw new PortalError('Descreva o ajuste em 10 a 2.000 caracteres.', 'validation');
    await this.deliveryAccess(orgId,'client');
    const {data,error}=await this.client.rpc('camaleao_decide_delivery',{
      p_organization_id:orgId,p_request_id:requestId,p_delivery_id:payload.deliveryId,
      p_content_hash:payload.contentHash,p_decision_id:payload.decisionId,
      p_outcome:payload.outcome,p_adjustment:payload.adjustment,
    });
    if(error) fail(error);
    return decisionFromRow(rpcRow(data));
  }

}
