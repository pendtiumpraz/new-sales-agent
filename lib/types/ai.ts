// AI provider/model registry types (Fase 3, doc 24).

export type ProviderKey = "deepseek" | "anthropic" | "openai" | "google";
export type CredentialSource = "tenant" | "platform";

export interface AiProvider {
  id: string;
  key: ProviderKey;
  displayName: string;
  baseUrl?: string | null;
  status: string;
}

export interface AiModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  contextWindow?: number | null;
  priceInPer1m?: number | null;
  priceOutPer1m?: number | null;
  capabilities: string[];
  isAvailable: boolean;
}

export interface AiUsage {
  id: string;
  tenantId: string;
  userId?: string | null;
  modelId?: string | null;
  feature?: string | null;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  latencyMs?: number | null;
  at: string | Date;
}
