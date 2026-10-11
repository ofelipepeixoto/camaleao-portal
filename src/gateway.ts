import { createClient } from '@supabase/supabase-js';
import type { Gateway } from './model.ts';
import { DemoGateway } from './demo-gateway.ts';
import { SupabaseGateway } from './supabase-gateway.ts';

export const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';
const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
function realGateway(): Gateway {
  if (!url || !key || !key.startsWith('sb_publishable_')) {
    const unavailable = async (): Promise<never> => { throw new Error('Portal em preparação. A equipe precisa conectar o acesso antes do piloto.'); };
    return { init: unavailable, signIn: unavailable, signOut: unavailable,
      memberships: unavailable, listRequests: unavailable, createRequest: unavailable, deliveryHistory: unavailable, presentDelivery: unavailable, decideDelivery: unavailable, onSessionChanged: () => () => {} };
  }
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('O acesso ao portal exige HTTPS.');
  return new SupabaseGateway(createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }));
}
// No silent switch to demo when a production connection fails.
export const gateway: Gateway = isDemo ? new DemoGateway(localStorage) : realGateway();
