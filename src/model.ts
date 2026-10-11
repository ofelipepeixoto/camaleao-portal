export type Category = 'peca_social' | 'campanha' | 'site' | 'automacao';
export type RequestStatus = 'recebido' | 'em_triagem';
export interface User { id: string; email: string }
export interface Membership { organizationId: string; organizationName: string; role: 'client' | 'operator' }
export interface RequestPayload {
  category: Category; goal: string; channel: string; format: string; context: string;
  desiredDeadline: string | null; urgency: 'normal' | 'urgente';
}
export interface PortalRequest extends RequestPayload {
  id: string; protocol: string; organizationId: string; createdBy?: string;
  status: RequestStatus; createdAt: string; updatedAt: string;
}
export interface Gateway {
  init(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  memberships(): Promise<Membership[]>;
  listRequests(orgId: string): Promise<PortalRequest[]>;
  createRequest(orgId: string, requestId: string, payload: RequestPayload): Promise<PortalRequest>;
  deliveryHistory(orgId: string, requestId: string): Promise<DeliveryHistory>;
  presentDelivery(orgId: string, requestId: string, payload: PresentDelivery): Promise<Delivery>;
  decideDelivery(orgId: string, requestId: string, payload: DecideDelivery): Promise<DeliveryDecision>;
  onSessionChanged(handler: (user: User | null) => void): () => void;
}

export interface Delivery {
  id: string; organizationId: string; requestId: string; version: number;
  content: string; contentHash: string; createdBy: string; createdAt: string;
}
export interface DeliveryDecision {
  id: string; organizationId: string; requestId: string; deliveryId: string;
  version: number; contentHash: string; actorId: string; outcome: 'approved' | 'changes_requested';
  adjustment: string; decidedAt: string;
}
export interface DeliveryHistory { deliveries: Delivery[]; decisions: DeliveryDecision[] }
export interface PresentDelivery {
  deliveryId: string; expectedDeliveryId: string | null; content: string;
}
export interface DecideDelivery {
  decisionId: string; deliveryId: string; contentHash: string;
  outcome: 'approved' | 'changes_requested'; adjustment: string;
}
