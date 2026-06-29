"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Wallet } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useWallet } from "@/hooks/useWallet";
import { createAgreementOnChain } from "@/lib/stellar";
import { createAgreement } from "@/lib/api";
import { config, xlmToStroops } from "@/lib/config";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SplitForm {
  recipient: string;
  pct: string; // 0-100, stored as percentage; BPS = pct * 100
}

interface MilestoneForm {
  amount: string;           // XLM
  delivery_deadline: string; // datetime-local
  review_deadline: string;   // datetime-local
  keeper_bounty: string;    // XLM
  splits: SplitForm[];
  open: boolean;
}

interface FormState {
  provider: string;
  settlement_asset: string;
  platform: string;
  milestones: MilestoneForm[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function defaultMilestone(walletAddress: string): MilestoneForm {
  const now = new Date();
  const delivery = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const review   = new Date(delivery.getTime() + 3 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 16);

  return {
    amount: "10",
    delivery_deadline: fmt(delivery),
    review_deadline: fmt(review),
    keeper_bounty: "0.05",
    open: true,
    splits: [{ recipient: walletAddress, pct: "100" }],
  };
}

function dtToTs(val: string): number {
  return Math.floor(new Date(val).getTime() / 1000);
}

function splitTotal(splits: SplitForm[]): number {
  return splits.reduce((s, x) => s + (parseFloat(x.pct) || 0), 0);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-apple-red mt-1">
      <AlertCircle size={11} /> {msg}
    </p>
  );
}

function SplitRow({
  split, index, onChange, onRemove, canRemove,
}: {
  split: SplitForm;
  index: number;
  onChange: (field: keyof SplitForm, val: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="flex gap-2 items-start">
      <div className="flex-1">
        <input
          className="input text-sm py-2"
          placeholder="Recipient address (G…)"
          value={split.recipient}
          onChange={(e) => onChange("recipient", e.target.value)}
        />
      </div>
      <div className="w-28 shrink-0">
        <div className="relative">
          <input
            className="input text-sm py-2 pr-7"
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="0"
            value={split.pct}
            onChange={(e) => onChange("pct", e.target.value)}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-apple-text-tertiary">%</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        className="mt-2 p-1.5 rounded-lg text-apple-text-tertiary hover:text-apple-red
          hover:bg-apple-red/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function MilestoneCard({
  ms, idx, total, onChange, onRemove, canRemove, errors,
}: {
  ms: MilestoneForm;
  idx: number;
  total: number;
  onChange: (updated: MilestoneForm) => void;
  onRemove: () => void;
  canRemove: boolean;
  errors: Record<string, string>;
}) {
  const pctSum = splitTotal(ms.splits);
  const pctOk  = Math.abs(pctSum - 100) < 0.001;

  const updateSplit = (si: number, field: keyof SplitForm, val: string) => {
    const splits = ms.splits.map((s, i) => (i === si ? { ...s, [field]: val } : s));
    onChange({ ...ms, splits });
  };

  const addSplit = () => {
    if (ms.splits.length >= 5) return;
    onChange({ ...ms, splits: [...ms.splits, { recipient: "", pct: "0" }] });
  };

  const removeSplit = (si: number) => {
    onChange({ ...ms, splits: ms.splits.filter((_, i) => i !== si) });
  };

  return (
    <Card className="border border-apple-separator">
      {/* Header */}
      <button
        type="button"
        className="flex items-center justify-between w-full text-left"
        onClick={() => onChange({ ...ms, open: !ms.open })}
      >
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-apple-blue/20 text-apple-blue text-xs
            font-semibold flex items-center justify-center">
            {idx + 1}
          </span>
          <span className="text-sm font-medium text-white">
            Milestone {idx + 1}
            {ms.amount && <span className="text-apple-text-secondary font-normal ml-1">· {ms.amount} XLM</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canRemove && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-1 rounded-lg text-apple-text-tertiary hover:text-apple-red
                hover:bg-apple-red/10 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
          {ms.open ? <ChevronUp size={15} className="text-apple-text-tertiary" /> : <ChevronDown size={15} className="text-apple-text-tertiary" />}
        </div>
      </button>

      {ms.open && (
        <div className="mt-4 space-y-4">
          {/* Amount + Bounty */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount (XLM)</label>
              <div className="relative">
                <input
                  className="input text-sm py-2.5 pr-12"
                  type="number"
                  min="0"
                  step="0.0000001"
                  placeholder="10"
                  value={ms.amount}
                  onChange={(e) => onChange({ ...ms, amount: e.target.value })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-apple-text-tertiary">XLM</span>
              </div>
              <FieldError msg={errors[`m${idx}_amount`]} />
            </div>
            <div>
              <label className="label">Keeper Bounty (XLM)</label>
              <div className="relative">
                <input
                  className="input text-sm py-2.5 pr-12"
                  type="number"
                  min="0"
                  step="0.0000001"
                  placeholder="0.05"
                  value={ms.keeper_bounty}
                  onChange={(e) => onChange({ ...ms, keeper_bounty: e.target.value })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-apple-text-tertiary">XLM</span>
              </div>
            </div>
          </div>

          {/* Deadlines */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Delivery Deadline</label>
              <input
                className="input text-sm py-2.5"
                type="datetime-local"
                value={ms.delivery_deadline}
                onChange={(e) => onChange({ ...ms, delivery_deadline: e.target.value })}
              />
              <FieldError msg={errors[`m${idx}_delivery`]} />
            </div>
            <div>
              <label className="label">Review Deadline</label>
              <input
                className="input text-sm py-2.5"
                type="datetime-local"
                value={ms.review_deadline}
                onChange={(e) => onChange({ ...ms, review_deadline: e.target.value })}
              />
              <FieldError msg={errors[`m${idx}_review`]} />
            </div>
          </div>

          {/* Splits */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Payment Splits</label>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                pctOk
                  ? "text-apple-green bg-apple-green/10"
                  : "text-apple-red bg-apple-red/10"
              }`}>
                {pctSum.toFixed(1)}%
              </span>
            </div>
            <div className="space-y-2">
              {ms.splits.map((sp, si) => (
                <SplitRow
                  key={si}
                  split={sp}
                  index={si}
                  onChange={(field, val) => updateSplit(si, field, val)}
                  onRemove={() => removeSplit(si)}
                  canRemove={ms.splits.length > 1}
                />
              ))}
            </div>
            <FieldError msg={errors[`m${idx}_splits`]} />
            {ms.splits.length < 5 && (
              <button
                type="button"
                onClick={addSplit}
                className="mt-2 flex items-center gap-1.5 text-xs text-apple-blue
                  hover:text-apple-blue/80 transition-colors"
              >
                <Plus size={12} /> Add recipient
              </button>
            )}
            <p className="text-xs text-apple-text-tertiary mt-2">
              Total must be exactly 100%. BPS per recipient = % × 100.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewAgreementPage() {
  const router = useRouter();
  const { isConnected, publicKey, connect, getSigner } = useWallet();

  const [form, setForm] = useState<FormState>({
    provider: "",
    settlement_asset: config.xlmContractId,
    platform: "GDCVFCADQFJ4VBPROR5XQX5G3UUKQ5TTWF3S7E6X7XUMIGS2P6HE2M5B",
    milestones: [defaultMilestone("")],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [txResult, setTxResult] = useState<{ agreementId: number; dbId?: number } | null>(null);

  // ── Auto-fill payer into first split when wallet connects ──
  const fillPayerSplit = useCallback(() => {
    if (!publicKey) return;
    setForm((f) => ({
      ...f,
      milestones: f.milestones.map((m) => ({
        ...m,
        splits: m.splits.map((s) =>
          s.recipient === "" ? { ...s, recipient: publicKey } : s,
        ),
      })),
    }));
  }, [publicKey]);

  // ── Milestone helpers ──
  const updateMilestone = (idx: number, updated: MilestoneForm) => {
    setForm((f) => ({
      ...f,
      milestones: f.milestones.map((m, i) => (i === idx ? updated : m)),
    }));
  };

  const addMilestone = () => {
    if (form.milestones.length >= 5) return;
    setForm((f) => ({
      ...f,
      milestones: [
        ...f.milestones.map((m) => ({ ...m, open: false })),
        defaultMilestone(publicKey ?? ""),
      ],
    }));
  };

  const removeMilestone = (idx: number) => {
    setForm((f) => ({
      ...f,
      milestones: f.milestones.filter((_, i) => i !== idx),
    }));
  };

  // ── Validation ──
  function validate(): boolean {
    const errs: Record<string, string> = {};
    const now = Math.floor(Date.now() / 1000);

    if (!publicKey) errs.payer = "Connect your wallet first.";
    if (!form.provider.match(/^G[A-Z2-7]{55}$/))
      errs.provider = "Invalid Stellar address.";
    if (publicKey && form.provider === publicKey)
      errs.provider = "Provider cannot be the same as payer.";
    if (!form.platform.match(/^G[A-Z2-7]{55}$/))
      errs.platform = "Invalid platform address.";

    form.milestones.forEach((m, idx) => {
      if (!m.amount || parseFloat(m.amount) <= 0)
        errs[`m${idx}_amount`] = "Amount must be greater than 0.";
      if (!m.delivery_deadline)
        errs[`m${idx}_delivery`] = "Delivery deadline required.";
      else if (dtToTs(m.delivery_deadline) <= now)
        errs[`m${idx}_delivery`] = "Deadline must be in the future.";

      if (!m.review_deadline)
        errs[`m${idx}_review`] = "Review deadline required.";
      else if (m.delivery_deadline && dtToTs(m.review_deadline) <= dtToTs(m.delivery_deadline))
        errs[`m${idx}_review`] = "Review deadline must be after delivery deadline.";

      const total = splitTotal(m.splits);
      if (Math.abs(total - 100) > 0.001)
        errs[`m${idx}_splits`] = `Splits must sum to 100% (currently ${total.toFixed(1)}%).`;

      const hasEmpty = m.splits.some((s) => !s.recipient.match(/^G[A-Z2-7]{55}$/));
      if (hasEmpty && !errs[`m${idx}_splits`])
        errs[`m${idx}_splits`] = "All recipient addresses must be valid.";
    });

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Submit ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) {
      // Open milestones with errors
      setForm((f) => ({
        ...f,
        milestones: f.milestones.map((m, idx) => ({
          ...m,
          open: Object.keys(errors).some((k) => k.startsWith(`m${idx}`)) ? true : m.open,
        })),
      }));
      return;
    }

    const signer = getSigner();
    if (!signer) return;

    setSubmitting(true);
    try {
      const milestones = form.milestones.map((m) => ({
        amount: xlmToStroops(m.amount),
        delivery_deadline: dtToTs(m.delivery_deadline),
        review_deadline: dtToTs(m.review_deadline),
        keeper_bounty: xlmToStroops(m.keeper_bounty || "0"),
        splits: m.splits.map((s) => ({
          recipient: s.recipient,
          bps: Math.round(parseFloat(s.pct) * 100),
        })),
      }));

      const onChainId = await createAgreementOnChain(signer, {
        payer: publicKey!,
        provider: form.provider,
        settlementAsset: form.settlement_asset,
        platform: form.platform,
        milestones,
      });

      // Also save to backend (best-effort) — capture DB id for navigation
      let dbId: number | undefined;
      try {
        const backendResult = await createAgreement({
          payer: publicKey!,
          provider: form.provider,
          settlement_asset: form.settlement_asset,
          platform: form.platform,
          milestones: form.milestones.map((m) => ({
            amount: String(xlmToStroops(m.amount)),
            delivery_deadline: dtToTs(m.delivery_deadline),
            review_deadline: dtToTs(m.review_deadline),
            keeper_bounty: String(xlmToStroops(m.keeper_bounty || "0")),
            splits: m.splits.map((s) => ({
              recipient: s.recipient,
              bps: Math.round(parseFloat(s.pct) * 100),
            })),
          })),
        });
        dbId = backendResult.id;
      } catch {
        // backend is optional — on-chain is the source of truth
      }

      setTxResult({ agreementId: Number(onChainId), dbId });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setErrors({ submit: msg });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success screen ──
  if (txResult) {
    return (
      <AppShell title="Agreement Created">
        <div className="max-w-md mx-auto mt-12 text-center">
          <div className="w-16 h-16 rounded-full bg-apple-green/15 flex items-center
            justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-apple-green" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Agreement Created!</h2>
          <p className="text-apple-text-secondary text-sm mb-1">
            On-chain ID: <span className="text-white font-mono">#{txResult.agreementId}</span>
          </p>
          <p className="text-apple-text-tertiary text-xs mb-8">
            The agreement is now active on Stellar Testnet.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => router.push(`/agreements/${txResult.dbId ?? txResult.agreementId}`)}
            >
              View Agreement
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setTxResult(null);
                setForm({
                  provider: "",
                  settlement_asset: config.xlmContractId,
                  platform: "GDCVFCADQFJ4VBPROR5XQX5G3UUKQ5TTWF3S7E6X7XUMIGS2P6HE2M5B",
                  milestones: [defaultMilestone(publicKey ?? "")],
                });
              }}
            >
              Create Another
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Form ──
  return (
    <AppShell title="New Agreement" subtitle="Define milestones, splits and deadlines">
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">

        {/* Wallet gate */}
        {!isConnected && (
          <Card className="border border-apple-blue/30 bg-apple-blue/5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-apple-blue/15 flex items-center
                justify-center shrink-0">
                <Wallet size={18} className="text-apple-blue" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Wallet required</p>
                <p className="text-xs text-apple-text-secondary mt-0.5">
                  Connect Freighter to sign the agreement on Stellar Testnet.
                </p>
              </div>
              <Button size="sm" onClick={connect} type="button">Connect</Button>
            </div>
          </Card>
        )}

        {/* Agreement details */}
        <Card>
          <h2 className="text-base font-semibold text-white mb-4">Agreement Details</h2>
          <div className="space-y-4">

            {/* Payer (read-only) */}
            <div>
              <label className="label">Payer (you)</label>
              <div className="input flex items-center gap-2 opacity-60 cursor-not-allowed">
                <Wallet size={14} className="text-apple-blue shrink-0" />
                <span className="font-mono text-sm truncate">
                  {publicKey ?? "Connect your wallet"}
                </span>
              </div>
              <FieldError msg={errors.payer} />
            </div>

            {/* Provider */}
            <div>
              <label className="label">Provider Address</label>
              <input
                className="input"
                placeholder="G… (Stellar address of the service provider)"
                value={form.provider}
                onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
              />
              <FieldError msg={errors.provider} />
            </div>

            {/* Settlement asset */}
            <div>
              <label className="label">Settlement Asset</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "XLM (Native)", value: config.xlmContractId },
                  { label: "USDC (Testnet)", value: config.usdcContractId },
                ].map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, settlement_asset: value }))}
                    className={`px-4 py-3 rounded-xl text-sm font-medium border transition-all
                      ${form.settlement_asset === value
                        ? "bg-apple-blue/15 border-apple-blue/50 text-apple-blue"
                        : "glass border-apple-separator text-apple-text-secondary hover:text-white"
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Platform */}
            <div>
              <label className="label">Platform Address</label>
              <input
                className="input"
                placeholder="G… (platform that collects fees)"
                value={form.platform}
                onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
              />
              <FieldError msg={errors.platform} />
              <p className="text-xs text-apple-text-tertiary mt-1">
                Pre-filled with default FlowLock platform address.
              </p>
            </div>
          </div>
        </Card>

        {/* Milestones */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white">
              Milestones
              <span className="text-apple-text-tertiary text-sm font-normal ml-2">
                ({form.milestones.length}/5)
              </span>
            </h2>
            {isConnected && form.milestones[0]?.splits[0]?.recipient === "" && (
              <button
                type="button"
                onClick={fillPayerSplit}
                className="text-xs text-apple-blue hover:text-apple-blue/80 transition-colors"
              >
                Fill my address in splits
              </button>
            )}
          </div>

          <div className="space-y-3">
            {form.milestones.map((ms, idx) => (
              <MilestoneCard
                key={idx}
                ms={ms}
                idx={idx}
                total={form.milestones.length}
                onChange={(updated) => updateMilestone(idx, updated)}
                onRemove={() => removeMilestone(idx)}
                canRemove={form.milestones.length > 1}
                errors={errors}
              />
            ))}
          </div>

          {form.milestones.length < 5 && (
            <button
              type="button"
              onClick={addMilestone}
              className="mt-3 w-full py-3 rounded-xl border border-dashed border-apple-separator
                text-sm text-apple-text-secondary hover:text-white hover:border-apple-blue/50
                hover:bg-apple-blue/5 transition-all flex items-center justify-center gap-2"
            >
              <Plus size={14} /> Add Milestone
            </button>
          )}
        </div>

        {/* Submit error */}
        {errors.submit && (
          <Card className="border border-apple-red/30 bg-apple-red/5">
            <p className="flex items-start gap-2 text-sm text-apple-red">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {errors.submit}
            </p>
          </Card>
        )}

        {/* Submit */}
        <div className="flex gap-3 justify-end pb-8">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={submitting}
            disabled={!isConnected}
          >
            {submitting ? "Signing…" : "Create Agreement"}
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
