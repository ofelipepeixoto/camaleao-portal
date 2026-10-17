export interface ReviewVersion { id:string; requestId:string; version:number; contentHash:string }
export interface ReviewDecision { deliveryId:string; contentHash:string }
// Only the latest version and its matching decision determine the badge.
export function awaitingReview(versions: ReviewVersion[], decisions: ReviewDecision[]): string[] {
  const latest = new Map<string,ReviewVersion>();
  for (const v of versions) if (!latest.has(v.requestId) || latest.get(v.requestId)!.version < v.version) latest.set(v.requestId,v);
  const decided = new Set(decisions.map(d=>`${d.deliveryId}:${d.contentHash}`));
  return [...latest.values()].filter(v=>!decided.has(`${v.id}:${v.contentHash}`)).map(v=>v.requestId);
}
