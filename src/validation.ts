import type { RequestPayload } from './model.ts';
export function validatePayload(p: RequestPayload): void {
  if (!['peca_social', 'campanha', 'site', 'automacao'].includes(p.category)) throw new Error('Escolha um tipo de pedido.');
  for (const [key, min, max, label] of [['goal', 1, 120, 'objetivo'], ['channel', 0, 80, 'canal'], ['format', 0, 80, 'formato'], ['context', 10, 2000, 'contexto']] as const) {
    if (typeof p[key] !== 'string' || p[key].length > max || p[key].trim().length < min) throw new Error(`Confira o ${label} e seu limite de caracteres.`);
  }
  if (!['normal', 'urgente'].includes(p.urgency)) throw new Error('Confira a urgência.');
  if (p.desiredDeadline !== null) {
    const date = new Date(p.desiredDeadline);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.desiredDeadline) || Number(p.desiredDeadline.slice(0, 4)) < 1 || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== p.desiredDeadline) throw new Error('Confira a data desejada.');
  }
}
