import { contract } from "@stellar/stellar-sdk";
import { SoroswapClient } from "./soroswap.js";
import { getNetworkPassphrase } from "./wallet.js";
import type { WalletSigner } from "./wallet.js";
import type {
  Agreement,
  ApproveReleaseParams,
  CancelParams,
  CreateAgreementInput,
  ExecuteDueParams,
  FlowLockConfig,
  FundParams,
  Milestone,
  RequestDisputeParams,
  ResolveParams,
  SubmitWorkParams,
} from "./types.js";

export class FlowLock {
  public readonly config: FlowLockConfig;
  public readonly soroswap: SoroswapClient;
  private readonly networkPassphrase: string;

  constructor(config: FlowLockConfig) {
    this.config = config;
    this.networkPassphrase = getNetworkPassphrase(config.network);
    this.soroswap = new SoroswapClient(config.network, config.soroswapApiUrl);
  }

  private async getClient(signer: WalletSigner) {
    return contract.Client.from({
      contractId: this.config.contractId,
      rpcUrl: this.config.rpcUrl,
      networkPassphrase: this.networkPassphrase,
      publicKey: signer.publicKey,
      signTransaction: signer.signTransaction,
    });
  }

  async createAgreement(input: CreateAgreementInput, signer: WalletSigner) {
    const client = await this.getClient(signer);
    const tx = await (client as any).create_agreement({
      payer: input.payer,
      provider: input.provider,
      settlement_asset: input.settlementAsset,
      platform: input.platform,
      milestones: input.milestones.map((m) => ({
        amount: m.amount,
        delivery_deadline: m.delivery_deadline,
        review_deadline: m.review_deadline,
        splits: m.splits.map((s) => ({
          recipient: s.recipient,
          bps: s.bps,
        })),
        keeper_bounty: m.keeper_bounty,
      })),
    });
    const sent = await tx.signAndSend();
    return sent.result as number;
  }

  async getAgreement(agreementId: number, signer: WalletSigner): Promise<Agreement> {
    const client = await this.getClient(signer);
    const tx = await (client as any).get_agreement({ agreement_id: agreementId });
    return tx.result as Agreement;
  }

  async getMilestone(agreementId: number, milestoneId: number, signer: WalletSigner): Promise<Milestone> {
    const client = await this.getClient(signer);
    const tx = await (client as any).get_milestone({
      agreement_id: agreementId,
      milestone_id: milestoneId,
    });
    return tx.result as Milestone;
  }

  async fundWithSettlementAsset(params: FundParams, signer: WalletSigner) {
    const client = await this.getClient(signer);
    const tx = await (client as any).fund_with_settlement_asset({
      agreement_id: params.agreementId,
      milestone_id: params.milestoneId,
      amount: params.amount,
    });
    return tx.signAndSend();
  }

  async submitWork(params: SubmitWorkParams, signer: WalletSigner) {
    const client = await this.getClient(signer);
    const tx = await (client as any).submit_work({
      agreement_id: params.agreementId,
      milestone_id: params.milestoneId,
      metadata_hash: params.metadataHash,
    });
    return tx.signAndSend();
  }

  async approveRelease(params: ApproveReleaseParams, signer: WalletSigner) {
    const client = await this.getClient(signer);
    const tx = await (client as any).approve_release({
      agreement_id: params.agreementId,
      milestone_id: params.milestoneId,
    });
    return tx.signAndSend();
  }

  async executeDue(params: ExecuteDueParams, signer: WalletSigner) {
    const client = await this.getClient(signer);
    const tx = await (client as any).execute_due({
      agreement_id: params.agreementId,
      milestone_id: params.milestoneId,
      caller: params.caller,
    });
    return tx.signAndSend();
  }

  async requestDispute(params: RequestDisputeParams, signer: WalletSigner) {
    const client = await this.getClient(signer);
    const tx = await (client as any).request_dispute({
      agreement_id: params.agreementId,
      milestone_id: params.milestoneId,
      reason_hash: params.reasonHash,
      caller: params.caller,
    });
    return tx.signAndSend();
  }

  async resolveByMutualAgreement(params: ResolveParams, signer: WalletSigner) {
    const client = await this.getClient(signer);
    const tx = await (client as any).resolve_by_mutual_agreement({
      agreement_id: params.agreementId,
      milestone_id: params.milestoneId,
      release_bps: params.releaseBps,
    });
    return tx.signAndSend();
  }

  async cancelUnfunded(params: CancelParams, signer: WalletSigner) {
    const client = await this.getClient(signer);
    const tx = await (client as any).cancel_unfunded({
      agreement_id: params.agreementId,
      caller: params.caller,
    });
    return tx.signAndSend();
  }

  async quoteFunding(inputAsset: string, settlementAsset: string, amount: string) {
    return this.soroswap.quoteFunding(inputAsset, settlementAsset, amount);
  }

  async buildSwapXdr(quote: Awaited<ReturnType<SoroswapClient["quoteFunding"]>>, from: string) {
    return this.soroswap.buildSwapXdr(quote, from);
  }
}
