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
  const { scValToNative } = await import("@stellar/stellar-sdk");
  const client = await getContractClient(signer);
  const tx = await (client as any).create_agreement({
    payer: params.payer,
    provider: params.provider,
    settlement_asset: params.settlementAsset,
    platform: params.platform,
    milestones: params.milestones,
  });
  const sent = await tx.signAndSend();

  // stellar-sdk v16 does not reliably populate .result on AssembledTransaction or
  // SentTransaction. Try every known path to extract the u64 agreement_id.
  const toNum = (v: unknown): number | null => {
    if (typeof v === "bigint") return Number(v);
    if (typeof v === "number" && Number.isFinite(v)) return v;
    return null;
  };

  const scToNum = (rv: unknown): number | null => {
    if (!rv) return null;
    try {
      const native = scValToNative(rv as any);
      const n = toNum(native);
      if (n !== null) return n;
      // Handle possible Result<u64> wrapper: ["Ok", bigint] or { Ok: bigint }
      if (Array.isArray(native) && typeof native[1] === "bigint") return Number(native[1]);
      if (native && typeof native === "object") {
        const obj = native as Record<string, unknown>;
        if (typeof obj.Ok === "bigint") return Number(obj.Ok);
      }
    } catch {}
    return null;
  };

  // 1. tx.result — simulated value (works in some v16 builds)
  const p1 = toNum(tx.result);
  if (p1 !== null) return p1;

  // 2. sent.result — actual execution result (v13 API, may still work)
  const p2 = toNum((sent as any)?.result);
  if (p2 !== null) return p2;

  // 3. sent.response.returnValue — v16 SentTransaction wraps the full RPC response
  const p3 = scToNum((sent as any)?.response?.returnValue);
  if (p3 !== null) return p3;

  // 4. sent.getTransactionResponse.returnValue — alternate v16 property name
  const p4 = scToNum((sent as any)?.getTransactionResponse?.returnValue);
  if (p4 !== null) return p4;

  // 5. tx.simulationData.result.retval — raw XDR ScVal from simulation
  const p5 = scToNum((tx as any)?.simulationData?.result?.retval);
  if (p5 !== null) return p5;

  // 6. tx.simulation.results[0].retval — alternate simulation data path
  const p6 = scToNum((tx as any)?.simulation?.results?.[0]?.retval);
  if (p6 !== null) return p6;

  return 0;
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
