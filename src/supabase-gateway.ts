import type { SupabaseClient } from '@supabase/supabase-js';
import type { Gateway, Membership, PortalRequest, RequestPayload, User } from './model.ts';
import { validatePayload } from './validation.ts';

export class PortalError extends Error {
  public code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}
function fail(error: { code?: string; status?: number } | null): never {
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
}
