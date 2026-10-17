import type { RequestPayload } from './model.ts';
// Tab-scoped, expiring drafts; no backend write and no credentials.
export class RequestDrafts {
  private storage: Pick<Storage, 'getItem'|'setItem'|'removeItem'|'key'|'length'>;
  constructor(storage: Pick<Storage, 'getItem'|'setItem'|'removeItem'|'key'|'length'>) { this.storage = storage; }
  private key(user: string, org: string) { return `camaleao-request-draft-v1:${user}:${org}`; }
  read(user: string, org: string): RequestPayload | null {
    try {
      const raw = JSON.parse(this.storage.getItem(this.key(user, org)) || 'null');
      if (!raw || Date.now() - raw.at > 86400000) { this.remove(user, org); return null; }
      const p = raw.payload;
      if (!p || !['category','goal','channel','format','context','urgency'].every(k => typeof p[k] === 'string') ||
          p.context.length > 2000 || !(p.desiredDeadline === null || typeof p.desiredDeadline === 'string')) return null;
      return p;
    } catch { return null; }
  }
  write(user: string, org: string, payload: RequestPayload, pendingId?: string): boolean {
    try { this.storage.setItem(this.key(user, org), JSON.stringify({at:Date.now(),payload,pendingId})); return true; }
    catch { return false; }
  }
  pendingId(user: string, org: string): string | undefined {
    if (!this.read(user, org)) return undefined;
    try { const id = JSON.parse(this.storage.getItem(this.key(user,org)) || '{}').pendingId;
      return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : undefined;
    } catch { return undefined; }
  }
  remove(user: string, org: string) { try { this.storage.removeItem(this.key(user, org)); } catch {} }
  clear(user: string) {
    try {
      const prefix = `camaleao-request-draft-v1:${user}:`;
      const keys = Array.from({length:this.storage.length}, (_,i)=>this.storage.key(i));
      for (const key of keys) if (key?.startsWith(prefix)) this.storage.removeItem(key);
    } catch {}
  }
}
