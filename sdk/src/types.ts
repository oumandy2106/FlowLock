export enum AgreementStatus {
  Draft = "Draft",
  Active = "Active",
  Completed = "Completed",
  Cancelled = "Cancelled",
}

export enum MilestoneStatus {
  Draft = "Draft",
  Funded = "Funded",
  Submitted = "Submitted",
  Released = "Released",
  Refunded = "Refunded",
  Disputed = "Disputed",
  MutualResolution = "MutualResolution",
  Cancelled = "Cancelled",
}

export interface Split {
  recipient: string;
  bps: number;
}

export interface MilestoneInput {
  amount: bigint;
  delivery_deadline: number;
  review_deadline: number;
  splits: Split[];
  keeper_bounty: bigint;
}

export interface Agreement {
  id: number;
  payer: string;
  provider: string;
  settlement_asset: string;
  platform: string;
  milestone_count: number;
  status: AgreementStatus;
}

export interface Milestone {
  amount: bigint;
  delivery_deadline: number;
  review_deadline: number;
  status: MilestoneStatus;
  nonce: number;
  splits: Split[];
  keeper_bounty: bigint;
  metadata_hash: string;
}

export interface CreateAgreementInput {
  payer: string;
  provider: string;
  settlementAsset: string;
  platform: string;
  milestones: MilestoneInput[];
}

export interface FundParams {
  agreementId: number;
  milestoneId: number;
  amount: bigint;
}

export interface SubmitWorkParams {
  agreementId: number;
  milestoneId: number;
  metadataHash: string;
}

export interface ApproveReleaseParams {
  agreementId: number;
  milestoneId: number;
}

export interface ExecuteDueParams {
  agreementId: number;
  milestoneId: number;
  caller: string;
}

export interface RequestDisputeParams {
  agreementId: number;
  milestoneId: number;
  reasonHash: string;
  caller: string;
}

export interface ResolveParams {
  agreementId: number;
  milestoneId: number;
  releaseBps: number;
}

export interface CancelParams {
  agreementId: number;
  caller: string;
}

export interface FlowLockConfig {
  network: "testnet" | "mainnet";
  rpcUrl: string;
  contractId: string;
  soroswapApiUrl?: string;
}

// Event types
export interface AgreementCreatedEvent {
  agreement_id: number;
}

export interface MilestoneFundedEvent {
  agreement_id: number;
  milestone_id: number;
  amount: bigint;
}

export interface WorkSubmittedEvent {
  agreement_id: number;
  milestone_id: number;
  metadata_hash: string;
}

export interface AutoReleasedEvent {
  agreement_id: number;
  milestone_id: number;
}

export interface RefundExecutedEvent {
  agreement_id: number;
  milestone_id: number;
}

export interface DisputeOpenedEvent {
  agreement_id: number;
  milestone_id: number;
  reason_hash: string;
}

export interface MutualResolutionReachedEvent {
  agreement_id: number;
  milestone_id: number;
  release_bps: number;
}

export interface SplitPaidEvent {
  agreement_id: number;
  milestone_id: number;
  recipient: string;
  amount: bigint;
}

export interface KeeperPaidEvent {
  agreement_id: number;
  milestone_id: number;
  keeper: string;
  amount: bigint;
}

export interface AgreementCancelledEvent {
  agreement_id: number;
}

export interface SoroswapQuoteRequest {
  assetIn: string;
  assetOut: string;
  amount: string;
  tradeType: "EXACT_IN" | "EXACT_OUT";
  protocols?: string[];
  slippageBps?: number;
}

export interface SoroswapQuoteResponse {
  assetIn: string;
  assetOut: string;
  amountIn: string;
  amountOut: number;
  otherAmountThreshold: number;
  tradeType: string;
  priceImpactPct: string;
  platform: string;
  rawTrade: Record<string, unknown>;
  routePlan: unknown[];
  platformFee?: {
    feeBps: number;
    feeAmount: number;
  };
}

export interface SoroswapBuildResponse {
  xdr: string;
}
