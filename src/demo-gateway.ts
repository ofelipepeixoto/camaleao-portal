import type { Gateway, Membership, PortalRequest, RequestPayload, User } from './model.ts';
import { PortalError } from './supabase-gateway.ts';
import { validatePayload } from './validation.ts';

// Fictional browser-only demonstration. This is deliberately NOT an authorization boundary.
const ORGS = [{ organizationId: '10000000-0000-4000-8000-000000000001', organizationName: 'Estúdio Aurora' },
  { organizationId: '10000000-0000-4000-8000-000000000002', organizationName: 'Horizonte Café' }];
const KEY = 'camaleao-fictitious-demo-v1';
const USERS = ['aurora@exemplo.test', 'horizonte@exemplo.test', 'equipe@exemplo.test'];
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
}
