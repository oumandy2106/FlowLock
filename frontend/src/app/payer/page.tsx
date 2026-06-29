"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Wallet, Zap, CheckCircle2, XCircle, AlertTriangle,
  ArrowRight, RefreshCw, ExternalLink, Info,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useWallet } from "@/hooks/useWallet";
import {
  fundMilestoneOnChain, approveReleaseOnChain, cancelUnfundedOnChain,
} from "@/lib/stellar";
import {
  getAgreement, getMilestones, getSoroswapQuote,
  type AgreementRow, type MilestoneRow,
} from "@/lib/api";
import { formatAddress, formatAmount, config, stellarExpertUrl, xlmToStroops, stroopsToXlm } from "@/lib/config";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActionType = "fund" | "approve" | "cancel";

interface PendingAction {
  type: ActionType;
  milestone?: MilestoneRow;
}

interface TxResult {
  success: boolean;
  txHash?: string;
  error?: string;
  action: ActionType;
  milestoneIdx?: number;
}

// ─── Soroswap Quote Banner ────────────────────────────────────────────────────

function SoroswapBanner({
  agreementId, amount, settlementAsset,
}: {
  agreementId: number;
  amount: string;
  settlementAsset: string;
}) {
  const [status, setStatus] = useState<"loading" | "ok" | "unavailable">("loading");
  const [quote, setQuote]   = useState<unknown>(null);

  useEffect(() => {
    if (settlementAsset === config.xlmContractId) {
      setStatus("unavailable"); // XLM native — no swap needed
      return;
    }
    getSoroswapQuote(config.xlmContractId, settlementAsset, amount)
      .then((q) => { setQuote(q); setStatus("ok"); })
      .catch(() => setStatus("unavailable"));
  }, [agreementId, amount, settlementAsset]);

  // XLM settlement — no banner needed
  if (settlementAsset === config.xlmContractId) return null;

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-apple-blue/5 border border-apple-blue/20">
        <RefreshCw size={13} className="text-apple-blue animate-spin shrink-0" />
        <p className="text-xs text-apple-text-secondary">Fetching Soroswap quote…</p>
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-apple-amber/5 border border-apple-amber/20">
        <AlertTriangle size={14} className="text-apple-amber shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-medium text-apple-amber">Soroswap unavailable on Testnet</p>
          <p className="text-xs text-apple-text-secondary mt-0.5">
            The DEX returns 403 on Testnet. Funding directly with the settlement asset instead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-apple-green/5 border border-apple-green/20">
      <CheckCircle2 size={14} className="text-apple-green shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-medium text-apple-green">Soroswap quote available</p>
        <p className="text-xs text-apple-text-secondary mt-0.5">
          Swap route found via Soroswap DEX.
        </p>
      </div>
    </div>
  );
}

// ─── Milestone Action Card ────────────────────────────────────────────────────

function MilestoneActionCard({
  ms, index, agreement, onAction, busy,
}: {
  ms: MilestoneRow;
  index: number;
  agreement: AgreementRow;
  onAction: (action: PendingAction) => void;
  busy: boolean;
}) {
  const canFund    = ms.status === "Draft";
  const canApprove = ms.status === "Submitted";
  const noAction   = !canFund && !canApprove;

  const deliveryTs = Number(ms.delivery_deadline) * 1000;
  const expired    = Date.now() > deliveryTs;

  return (
    <Card className={`border ${canFund || canApprove ? "border-apple-blue/30" : "border-apple-separator opacity-60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5
            ${canFund || canApprove ? "bg-apple-blue/20 text-apple-blue" : "bg-apple-surface-2 text-apple-text-secondary"}`}>
            {index + 1}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">
                {formatAmount(BigInt(ms.amount))}
              </span>
              <StatusBadge status={ms.status} size="sm" />
            </div>
            <p className={`text-xs mt-0.5 ${expired && canFund ? "text-apple-red" : "text-apple-text-tertiary"}`}>
              {expired && canFund ? "Delivery deadline expired · " : ""}
              Due {new Date(deliveryTs).toLocaleDateString()}
            </p>
            {Number(ms.keeper_bounty) > 0 && (
              <p className="text-xs text-apple-text-tertiary mt-0.5">
                Keeper bounty: {formatAmount(BigInt(ms.keeper_bounty))}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {canFund && (
            <Button
              size="sm"
              icon={<Zap size={13} />}
              loading={busy}
              onClick={() => onAction({ type: "fund", milestone: ms })}
            >
              Fund
            </Button>
          )}
          {canApprove && (
            <Button
              size="sm"
              variant="secondary"
              icon={<CheckCircle2 size={13} />}
              loading={busy}
              onClick={() => onAction({ type: "approve", milestone: ms })}
            >
              Approve
            </Button>
          )}
          {noAction && (
            <span className="text-xs text-apple-text-tertiary px-2">No action</span>
          )}
        </div>
      </div>

      {/* Soroswap banner for fundable milestones */}
      {canFund && (
        <div className="mt-3">
          <SoroswapBanner
            agreementId={Number(agreement.on_chain_id ?? agreement.id)}
            amount={ms.amount}
            settlementAsset={agreement.settlement_asset}
          />
        </div>
      )}
    </Card>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  action, agreement, onConfirm, onCancel, busy,
}: {
  action: PendingAction;
  agreement: AgreementRow;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const isCancel = action.type === "cancel";
  const isApprove = action.type === "approve";
  const isFund = action.type === "fund";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-sm border border-apple-separator">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center
            ${isCancel ? "bg-apple-red/15" : isFund ? "bg-apple-blue/15" : "bg-apple-green/15"}`}>
            {isCancel  && <XCircle size={18} className="text-apple-red" />}
            {isFund    && <Zap size={18} className="text-apple-blue" />}
            {isApprove && <CheckCircle2 size={18} className="text-apple-green" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {isCancel  && "Cancel Agreement"}
              {isFund    && `Fund Milestone #${(action.milestone?.milestone_index ?? 0) + 1}`}
              {isApprove && `Approve Release #${(action.milestone?.milestone_index ?? 0) + 1}`}
            </p>
            <p className="text-xs text-apple-text-secondary mt-0.5">
              Agreement #{agreement.on_chain_id ?? agreement.id}
            </p>
          </div>
        </div>

        {isFund && action.milestone && (
          <div className="surface rounded-xl p-3 mb-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-apple-text-secondary">Amount</span>
              <span className="text-white font-medium">{formatAmount(BigInt(action.milestone.amount))}</span>
            </div>
            {Number(action.milestone.keeper_bounty) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-apple-text-secondary">Keeper bounty</span>
                <span className="text-apple-amber font-medium">{formatAmount(BigInt(action.milestone.keeper_bounty))}</span>
              </div>
            )}
          </div>
        )}

        {isApprove && action.milestone && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-apple-green/5 border border-apple-green/20 mb-4">
            <Info size={13} className="text-apple-green shrink-0 mt-0.5" />
            <p className="text-xs text-apple-text-secondary">
              This will release payment to the provider. The action is irreversible.
            </p>
          </div>
        )}

        {isCancel && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-apple-red/5 border border-apple-red/20 mb-4">
            <AlertTriangle size={13} className="text-apple-red shrink-0 mt-0.5" />
            <p className="text-xs text-apple-text-secondary">
              Only unfunded agreements can be cancelled. This action is irreversible.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            variant={isCancel ? "danger" : "primary"}
            loading={busy}
            onClick={onConfirm}
          >
            {isCancel ? "Cancel Agreement" : isApprove ? "Approve Release" : "Confirm Fund"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ─── Inner page (needs useSearchParams) ──────────────────────────────────────

function PayerInner() {
  const searchParams = useSearchParams();
  const { isConnected, publicKey, connect, getSigner } = useWallet();

  const [agreementInput, setAgreementInput] = useState(searchParams.get("agreement") ?? "");
  const [agreement, setAgreement] = useState<AgreementRow | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [loading, setLoading]  = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pending, setPending]  = useState<PendingAction | null>(null);
  const [busy, setBusy]        = useState(false);
  const [txResult, setTxResult] = useState<TxResult | null>(null);

  const loadAgreement = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    setAgreement(null);
    setMilestones([]);
    try {
      const [ag, ms] = await Promise.all([getAgreement(id), getMilestones(id)]);
      setAgreement(ag);
      setMilestones(ms);
    } catch {
      setLoadError("Agreement not found or backend unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load if ?agreement= is in URL
  useEffect(() => {
    const id = searchParams.get("agreement");
    if (id) loadAgreement(id);
  }, [searchParams, loadAgreement]);

  const handleExecute = async () => {
    if (!pending || !agreement) return;
    const signer = getSigner();
    if (!signer) return;

    setBusy(true);
    const chainId = Number(agreement.on_chain_id ?? agreement.id);

    try {
      if (pending.type === "fund" && pending.milestone) {
        const mi = pending.milestone.milestone_index;
        const amount = BigInt(pending.milestone.amount);
        await fundMilestoneOnChain(signer, chainId, mi, amount);
        setTxResult({ success: true, action: "fund", milestoneIdx: mi });
      } else if (pending.type === "approve" && pending.milestone) {
        const mi = pending.milestone.milestone_index;
        await approveReleaseOnChain(signer, chainId, mi);
        setTxResult({ success: true, action: "approve", milestoneIdx: mi });
      } else if (pending.type === "cancel") {
        await cancelUnfundedOnChain(signer, chainId);
        setTxResult({ success: true, action: "cancel" });
      }
      // Reload milestones after success
      await loadAgreement(String(agreement.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxResult({ success: false, error: msg, action: pending.type });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const canCancel = agreement?.status === "Active" &&
    milestones.every((m) => m.status === "Draft");

  // ── Wallet gate ──
  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-apple-amber/10 flex items-center
          justify-center mx-auto mb-4">
          <Wallet size={28} className="text-apple-amber" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Connect your wallet</h2>
        <p className="text-sm text-apple-text-secondary mb-6">
          You need to connect Freighter as the payer to fund milestones or approve releases.
        </p>
        <Button onClick={connect} icon={<Wallet size={15} />}>Connect Freighter</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* Wallet info */}
      <Card className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-apple-amber/15 flex items-center justify-center shrink-0">
          <Wallet size={14} className="text-apple-amber" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-apple-text-secondary">Connected as payer</p>
          <p className="font-mono text-sm text-white truncate">{publicKey}</p>
        </div>
      </Card>

      {/* Agreement lookup */}
      <Card>
        <h2 className="text-base font-semibold text-white mb-3">Agreement</h2>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Agreement ID (e.g. 0)"
            value={agreementInput}
            onChange={(e) => setAgreementInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadAgreement(agreementInput)}
          />
          <Button
            onClick={() => loadAgreement(agreementInput)}
            loading={loading}
            disabled={!agreementInput}
          >
            Load
          </Button>
        </div>
        {loadError && (
          <p className="text-xs text-apple-red mt-2 flex items-center gap-1">
            <XCircle size={11} /> {loadError}
          </p>
        )}
      </Card>

      {/* Agreement loaded */}
      {agreement && (
        <>
          {/* Summary */}
          <Card>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-apple-text-secondary">Agreement #{agreement.on_chain_id ?? agreement.id}</p>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={agreement.status} />
                </div>
              </div>
              <Link href={`/agreements/${agreement.id}`}>
                <Button variant="secondary" size="sm" icon={<ExternalLink size={12} />}>
                  Detail
                </Button>
              </Link>
            </div>
            <div className="flex items-center gap-2 text-xs text-apple-text-secondary">
              <span className="font-mono">{formatAddress(agreement.payer, 6)}</span>
              <ArrowRight size={11} />
              <span className="font-mono">{formatAddress(agreement.provider, 6)}</span>
            </div>

            {/* Payer mismatch warning */}
            {publicKey && agreement.payer.toLowerCase() !== publicKey.toLowerCase() && (
              <div className="flex items-start gap-2 mt-3 p-2.5 rounded-xl bg-apple-red/5 border border-apple-red/20">
                <AlertTriangle size={13} className="text-apple-red shrink-0 mt-0.5" />
                <p className="text-xs text-apple-text-secondary">
                  Your connected wallet is not the payer of this agreement. Transactions will fail.
                </p>
              </div>
            )}
          </Card>

          {/* Tx result banner */}
          {txResult && (
            <div className={`flex items-start gap-3 p-4 rounded-2xl border
              ${txResult.success
                ? "bg-apple-green/5 border-apple-green/30"
                : "bg-apple-red/5 border-apple-red/30"}`}>
              {txResult.success
                ? <CheckCircle2 size={16} className="text-apple-green shrink-0 mt-0.5" />
                : <XCircle size={16} className="text-apple-red shrink-0 mt-0.5" />}
              <div>
                <p className={`text-sm font-medium ${txResult.success ? "text-apple-green" : "text-apple-red"}`}>
                  {txResult.success
                    ? txResult.action === "fund"    ? "Milestone funded!"
                    : txResult.action === "approve" ? "Release approved!"
                    : "Agreement cancelled!"
                    : "Transaction failed"}
                </p>
                {txResult.error && (
                  <p className="text-xs text-apple-text-secondary mt-0.5">{txResult.error}</p>
                )}
                {txResult.txHash && (
                  <a
                    href={stellarExpertUrl(txResult.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-apple-blue mt-1"
                  >
                    View on Stellar Expert <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Milestone actions */}
          <div>
            <h2 className="text-xs font-semibold text-apple-text-secondary uppercase tracking-wider mb-3 px-1">
              Milestones
            </h2>
            <div className="space-y-3">
              {milestones.map((ms, i) => (
                <MilestoneActionCard
                  key={ms.id}
                  ms={ms}
                  index={i}
                  agreement={agreement}
                  onAction={setPending}
                  busy={busy}
                />
              ))}
            </div>
          </div>

          {/* Cancel agreement */}
          {canCancel && (
            <Card className="border border-apple-red/20">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Cancel Agreement</p>
                  <p className="text-xs text-apple-text-secondary mt-0.5">
                    All milestones are unfunded. You can cancel and reclaim any deposits.
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  icon={<XCircle size={13} />}
                  onClick={() => setPending({ type: "cancel" })}
                  loading={busy}
                >
                  Cancel
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Confirm modal */}
      {pending && agreement && (
        <ConfirmModal
          action={pending}
          agreement={agreement}
          onConfirm={handleExecute}
          onCancel={() => setPending(null)}
          busy={busy}
        />
      )}
    </div>
  );
}

// ─── Page wrapper (Suspense for useSearchParams) ──────────────────────────────

export default function PayerPage() {
  return (
    <AppShell
      title="Payer Panel"
      subtitle="Fund milestones · Approve releases · Cancel agreements"
    >
      <Suspense fallback={
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="skeleton h-16 w-full rounded-2xl" />
          <div className="skeleton h-20 w-full rounded-2xl" />
        </div>
      }>
        <PayerInner />
      </Suspense>
    </AppShell>
  );
}
