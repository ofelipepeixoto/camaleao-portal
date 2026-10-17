export type View = 'requests' | 'history' | 'queue';
const routes: Record<View, string> = {requests:'#/pedidos',history:'#/historico',queue:'#/triagem'};
export function viewFromHash(hash: string): View {
  return (Object.keys(routes) as View[]).find(view => routes[view] === hash) ?? 'requests';
}
export function hashFromView(view: View): string { return routes[view]; }
export function allowedView(view: View, operator: boolean): View { return view === 'queue' && !operator ? 'requests' : view; }
