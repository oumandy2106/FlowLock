"use client";

import { config } from "./config";

export interface WalletSigner {
  publicKey: string;
  signTransaction: (xdr: string) => Promise<{ signedTxXdr: string; signerAddress?: string }>;
}

export async function getContractClient(signer: WalletSigner) {
  const { contract } = await import("@stellar/stellar-sdk");
  return contract.Client.from({
    contractId: config.contractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    publicKey: signer.publicKey,
    signTransaction: signer.signTransaction,
  });
}

export async function createAgreementOnChain(
  signer: WalletSigner,
  params: {
    payer: string;
    provider: string;
    settlementAsset: string;
    platform: string;
    milestones: {
      amount: bigint;
      delivery_deadline: number;
      review_deadline: number;
      splits: { recipient: string; bps: number }[];
      keeper_bounty: bigint;
    }[];
  },
): Promise<number> {
  const client = await getContractClient(signer);
  const tx = await (client as any).create_agreement({
    payer: params.payer,
    provider: params.provider,
    settlement_asset: params.settlementAsset,
    platform: params.platform,
    milestones: params.milestones,
  });
  const result = await tx.signAndSend();
  return result.result as number;
}

export async function fundMilestoneOnChain(
  signer: WalletSigner,
  agreementId: number,
  milestoneId: number,
  amount: bigint,
) {
  const client = await getContractClient(signer);
  const tx = await (client as any).fund_with_settlement_asset({
    agreement_id: agreementId,
    milestone_id: milestoneId,
    amount,
  });
  return tx.signAndSend();
}

export async function submitWorkOnChain(
  signer: WalletSigner,
  agreementId: number,
  milestoneId: number,
  metadataHash: string,
) {
  const client = await getContractClient(signer);
  // Contract expects BytesN<32> — convert 64-char hex string to 32 bytes
  const hashBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    hashBytes[i] = parseInt(metadataHash.slice(i * 2, i * 2 + 2), 16);
  }
  const tx = await (client as any).submit_work({
    agreement_id: agreementId,
    milestone_id: milestoneId,
    metadata_hash: hashBytes,
  });
  return tx.signAndSend();
}

export async function approveReleaseOnChain(
  signer: WalletSigner,
  agreementId: number,
  milestoneId: number,
) {
  const client = await getContractClient(signer);
  const tx = await (client as any).approve_release({
    agreement_id: agreementId,
    milestone_id: milestoneId,
  });
  return tx.signAndSend();
}

export async function executeDueOnChain(
  signer: WalletSigner,
  agreementId: number,
  milestoneId: number,
) {
  const client = await getContractClient(signer);
  const tx = await (client as any).execute_due({
    agreement_id: agreementId,
    milestone_id: milestoneId,
    caller: signer.publicKey,
  });
  return tx.signAndSend();
}

export async function cancelUnfundedOnChain(
  signer: WalletSigner,
  agreementId: number,
) {
  const client = await getContractClient(signer);
  const tx = await (client as any).cancel_unfunded({
    agreement_id: agreementId,
    caller: signer.publicKey,
  });
  return tx.signAndSend();
}
