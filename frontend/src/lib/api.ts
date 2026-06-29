import { config } from "./config";

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  requireAuth = false,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (requireAuth || config.apiKey) {
    headers["X-API-Key"] = config.apiKey;
  }

  const res = await fetch(`${config.backendUrl}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error?.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

// --- Health ---

export function getHealth() {
  return apiFetch<{ status: string; timestamp: string }>("/api/health");
}

// --- Integrators ---

export function registerIntegrator(name: string, platformAddress?: string) {
  return apiFetch<{ id: number; name: string; api_key: string }>(
    "/api/integrators/register",
    {
      method: "POST",
      body: JSON.stringify({ name, platform_address: platformAddress }),
    },
  );
}

// --- Agreements ---

export interface AgreementRow {
  id: number;
  on_chain_id: number | null;
  payer: string;
  provider: string;
  settlement_asset: string;
  platform: string | null;
  milestone_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MilestoneRow {
  id: number;
  agreement_id: number;
  milestone_index: number;
  amount: string;
  delivery_deadline: string;
  review_deadline: string;
  status: string;
  metadata_hash: string | null;
  keeper_bounty: string;
  created_at: string;
  updated_at: string;
  splits: { recipient: string; bps: number }[];
  events?: EventRow[];
}

export interface CreateAgreementPayload {
  payer: string;
  provider: string;
  settlement_asset: string;
  platform?: string;
  milestones: {
    amount: string;
    delivery_deadline: number;
    review_deadline: number;
    keeper_bounty: string;
    splits: { recipient: string; bps: number }[];
  }[];
}

export function listAgreements(params?: { limit?: number; offset?: number; payer?: string; provider?: string }) {
  const qs = new URLSearchParams();
  if (params?.limit)    qs.set("limit",    String(params.limit));
  if (params?.offset)   qs.set("offset",   String(params.offset));
  if (params?.payer)    qs.set("payer",    params.payer);
  if (params?.provider) qs.set("provider", params.provider);
  const q = qs.toString();
  return apiFetch<AgreementRow[]>(`/api/agreements${q ? `?${q}` : ""}`);
}

export function createAgreement(data: CreateAgreementPayload) {
  return apiFetch<{ id: number }>("/api/agreements", {
    method: "POST",
    body: JSON.stringify(data),
  }, true);
}

export function getAgreement(id: number | string) {
  return apiFetch<AgreementRow>(`/api/agreements/${id}`);
}

export function getMilestones(agreementId: number | string) {
  return apiFetch<MilestoneRow[]>(`/api/agreements/${agreementId}/milestones`);
}

export function getMilestone(agreementId: number | string, milestoneIndex: number | string) {
  return apiFetch<MilestoneRow>(
    `/api/agreements/${agreementId}/milestones/${milestoneIndex}`,
  );
}

// --- Events ---

export interface EventRow {
  id: number;
  event_type: string;
  agreement_id: number;
  milestone_index: number | null;
  payload: Record<string, unknown>;
  ledger: number;
  tx_hash: string;
  created_at: string;
}

export function getEvents(filters?: {
  event_type?: string;
  agreement_id?: number;
  limit?: number;
  offset?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.event_type) params.set("event_type", filters.event_type);
  if (filters?.agreement_id) params.set("agreement_id", String(filters.agreement_id));
  if (filters?.limit) params.set("limit", String(filters.limit));
  if (filters?.offset) params.set("offset", String(filters.offset));
  const qs = params.toString();
  return apiFetch<EventRow[]>(`/api/events${qs ? `?${qs}` : ""}`, {}, true);
}

// --- Keeper ---

export interface KeeperStatus {
  last_run: {
    id: number;
    agreement_id: number;
    milestone_index: number;
    action: string;
    tx_hash: string | null;
    status: string;
    bounty_earned: string | null;
    error: string | null;
    created_at: string;
  } | null;
  pending_milestones: number;
  total_bounties: number;
}

export function getKeeperStatus() {
  return apiFetch<KeeperStatus>("/api/keeper/status");
}

export interface DueMilestone extends MilestoneRow {
  payer: string;
  provider: string;
  settlement_asset: string;
  agreement_on_chain_id: number | null;
}

export function getKeeperDue() {
  return apiFetch<DueMilestone[]>("/api/keeper/due");
}

export interface KeeperRun {
  id: number;
  agreement_id: number;
  milestone_index: number;
  action: string;
  tx_hash: string | null;
  status: string;
  bounty_earned: string | null;
  error: string | null;
  created_at: string;
}

export function getKeeperRuns(limit = 20) {
  return apiFetch<KeeperRun[]>(`/api/keeper/runs?limit=${limit}`);
}

// --- Soroswap ---

export function getSoroswapQuote(inputAsset: string, settlementAsset: string, amount: string) {
  return apiFetch<unknown>("/api/soroswap/quote", {
    method: "POST",
    body: JSON.stringify({ inputAsset, settlementAsset, amount }),
  });
}
