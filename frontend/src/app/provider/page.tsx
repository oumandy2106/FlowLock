"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Wallet, FileText, CheckCircle2, XCircle,
  ArrowRight, ExternalLink, Hash, AlertTriangle, Info,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useWallet } from "@/hooks/useWallet";
import { submitWorkOnChain } from "@/lib/stellar";
import { getAgreement, getMilestones, type AgreementRow, type MilestoneRow } from "@/lib/api";
import { formatAddress, formatAmount, stellarExpertUrl } from "@/lib/config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TxResult {
  success: boolean;
  txHash?: string;
  error?: string;
  milestoneIdx?: number;
}

// ─── Metadata hash helpers ────────────────────────────────────────────────────

async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data    = encoder.encode(text);
  const buf     = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Submit Work Card ─────────────────────────────────────────────────────────

function SubmitWorkCard({
  ms, index, onSubmit, busy,
}: {
  ms: MilestoneRow;
  index: number;
  onSubmit: (ms: MilestoneRow, hash: string) => void;
  busy: boolean;
}) {
  const [metadataInput, setMetadataInput] = useState("");
  const [hashPreview, setHashPreview]     = useState("");
  const [useRaw, setUseRaw]               = useState(false);
  const [open, setOpen]                   = useState(true);

  const isFunded    = ms.status === "Funded";
  const isSubmitted = ms.status === "Submitted";
  const canSubmit   = isFunded;

  const updateHash = useCallback(async (val: string) => {
    setMetadataInput(val);
    if (!val) { setHashPreview(""); return; }
    if (useRaw) {
      setHashPreview(val.replace(/\s/g, "").slice(0, 64));
    } else {
      const h = await hashText(val);
      setHashPreview(h);
    }
  }, [useRaw]);

  useEffect(() => { updateHash(metadataInput); }, [useRaw, updateHash, metadataInput]);

  const handleSubmit = () => {
    if (!hashPreview || hashPreview.length !== 64) return;
    onSubmit(ms, hashPreview);
  };

  const deliveryTs = Number(ms.delivery_deadline) * 1000;
  const expired    = Date.now() > deliveryTs;

  return (
    <Card className={`border ${canSubmit ? "border-apple-green/30" : isSubmitted ? "border-apple-blue/20" : "border-apple-separator opacity-60"}`}>
      {/* Header */}
      <button
        type="button"
        className="flex items-center justify-between w-full text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0
            ${canSubmit ? "bg-apple-green/20 text-apple-green" : "bg-apple-surface-2 text-apple-text-secondary"}`}>
            {index + 1}
          </span>
          <div className="text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">{formatAmount(BigInt(ms.amount))}</span>
              <StatusBadge status={ms.status} size="sm" />
            </div>
            <p className={`text-xs mt-0.5 ${expired && canSubmit ? "text-apple-red" : "text-apple-text-tertiary"}`}>
              {expired && canSubmit ? "Deadline expired · " : ""}
              Due {new Date(deliveryTs).toLocaleDateString()}
            </p>
          </div>
        </div>
        <span className="text-xs text-apple-text-tertiary">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {/* Already submitted */}
          {isSubmitted && ms.metadata_hash && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-apple-blue/5 border border-apple-blue/20">
              <CheckCircle2 size={14} className="text-apple-blue shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-apple-blue">Work already submitted</p>
                <div className="flex items-center gap-1 mt-1">
                  <Hash size={10} className="text-apple-text-tertiary shrink-0" />
                  <span className="font-mono text-xs text-apple-text-secondary break-all">
                    {ms.metadata_hash}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Not funded yet */}
          {!canSubmit && !isSubmitted && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-apple-surface-2">
              <Info size={13} className="text-apple-text-tertiary shrink-0" />
              <p className="text-xs text-apple-text-secondary">
                This milestone must be funded by the payer before you can submit work.
              </p>
            </div>
          )}

          {/* Submit form */}
          {canSubmit && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="label mb-0">Work description or URL</label>
                  <button
                    type="button"
                    onClick={() => setUseRaw((r) => !r)}
                    className="text-xs text-apple-blue hover:text-apple-blue/80 transition-colors"
                  >
                    {useRaw ? "Auto-hash" : "Paste raw hash"}
                  </button>
                </div>
                <textarea
                  className="input resize-none text-sm"
                  rows={3}
                  placeholder={
                    useRaw
                      ? "Paste a 64-char SHA-256 hex hash"
                      : "Describe your deliverable, paste a link, or any text — it will be hashed"
                  }
                  value={metadataInput}
                  onChange={(e) => updateHash(e.target.value)}
                />
              </div>

              {hashPreview && (
                <div className="surface rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Hash size={11} className="text-apple-text-tertiary" />
                    <p className="text-xs text-apple-text-tertiary">
                      {useRaw ? "Hash (raw)" : "SHA-256 hash (stored on-chain)"}
                    </p>
                  </div>
                  <p className={`font-mono text-xs break-all ${hashPreview.length === 64 ? "text-apple-green" : "text-apple-red"}`}>
                    {hashPreview}
                  </p>
                  {hashPreview.length !== 64 && (
                    <p className="text-xs text-apple-red mt-1">Hash must be exactly 64 hex characters.</p>
                  )}
                </div>
              )}

              {expired && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-apple-amber/5 border border-apple-amber/20">
                  <AlertTriangle size={13} className="text-apple-amber shrink-0 mt-0.5" />
                  <p className="text-xs text-apple-text-secondary">
                    The delivery deadline has passed. The keeper may auto-refund this milestone before you submit.
                  </p>
                </div>
              )}

              <Button
                className="w-full"
                icon={<FileText size={14} />}
                loading={busy}
                disabled={!hashPreview || hashPreview.length !== 64}
                onClick={handleSubmit}
              >
                Submit Work
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Inner page ───────────────────────────────────────────────────────────────

function ProviderInner() {
  const searchParams = useSearchParams();
  const { isConnected, publicKey, connect, getSigner } = useWallet();

  const [agreementInput, setAgreementInput] = useState(searchParams.get("agreement") ?? "");
  const [agreement, setAgreement] = useState<AgreementRow | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busy, setBusy]         = useState(false);
  const [txResult, setTxResult] = useState<TxResult | null>(null);

  const loadAgreement = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    setAgreement(null);
    setMilestones([]);
    setTxResult(null);
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

  useEffect(() => {
    const id = searchParams.get("agreement");
    if (id) loadAgreement(id);
  }, [searchParams, loadAgreement]);

  const handleSubmitWork = async (ms: MilestoneRow, hash: string) => {
    if (!agreement) return;
    const signer = getSigner();
    if (!signer) return;

    setBusy(true);
    setTxResult(null);
    const chainId = Number(agreement.on_chain_id ?? agreement.id);

    try {
      await submitWorkOnChain(signer, chainId, ms.milestone_index, hash);
      setTxResult({ success: true, milestoneIdx: ms.milestone_index });
      await loadAgreement(String(agreement.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxResult({ success: false, error: msg, milestoneIdx: ms.milestone_index });
    } finally {
      setBusy(false);
    }
  };

  // ── Wallet gate ──
  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto mt-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-apple-green/10 flex items-center
          justify-center mx-auto mb-4">
          <Wallet size={28} className="text-apple-green" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Connect your wallet</h2>
        <p className="text-sm text-apple-text-secondary mb-6">
          You need to connect Freighter as the provider to submit work.
        </p>
        <Button onClick={connect} icon={<Wallet size={15} />}>Connect Freighter</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* Wallet info */}
      <Card className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-apple-green/15 flex items-center justify-center shrink-0">
          <Wallet size={14} className="text-apple-green" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-apple-text-secondary">Connected as provider</p>
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
                <p className="text-xs text-apple-text-secondary">
                  Agreement #{agreement.on_chain_id ?? agreement.id}
                </p>
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

            {/* Provider mismatch warning */}
            {publicKey && agreement.provider.toLowerCase() !== publicKey.toLowerCase() && (
              <div className="flex items-start gap-2 mt-3 p-2.5 rounded-xl bg-apple-red/5 border border-apple-red/20">
                <AlertTriangle size={13} className="text-apple-red shrink-0 mt-0.5" />
                <p className="text-xs text-apple-text-secondary">
                  Your connected wallet is not the provider of this agreement. Transactions will fail.
                </p>
              </div>
            )}
          </Card>

          {/* Tx result */}
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
                    ? `Work submitted for milestone #${(txResult.milestoneIdx ?? 0) + 1}!`
                    : "Transaction failed"}
                </p>
                {txResult.error && (
                  <p className="text-xs text-apple-text-secondary mt-0.5">{txResult.error}</p>
                )}
                {txResult.success && (
                  <p className="text-xs text-apple-text-secondary mt-0.5">
                    Waiting for payer approval or keeper auto-release after review deadline.
                  </p>
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

          {/* Milestone cards */}
          <div>
            <h2 className="text-xs font-semibold text-apple-text-secondary uppercase tracking-wider mb-3 px-1">
              Milestones
            </h2>
            <div className="space-y-3">
              {milestones.map((ms, i) => (
                <SubmitWorkCard
                  key={ms.id}
                  ms={ms}
                  index={i}
                  onSubmit={handleSubmitWork}
                  busy={busy}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function ProviderPage() {
  return (
    <AppShell
      title="Provider Panel"
      subtitle="Submit work · Track milestone status"
    >
      <Suspense fallback={
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="skeleton h-16 w-full rounded-2xl" />
          <div className="skeleton h-20 w-full rounded-2xl" />
        </div>
      }>
        <ProviderInner />
      </Suspense>
    </AppShell>
  );
}
