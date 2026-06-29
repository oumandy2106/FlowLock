"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Bot, Zap, CheckCircle2, XCircle, RefreshCw,
  Clock, ExternalLink, Wallet, AlertTriangle, Trophy,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useWallet } from "@/hooks/useWallet";
import { executeDueOnChain } from "@/lib/stellar";
import {
  getKeeperStatus, getKeeperDue, getKeeperRuns,
  type KeeperStatus, type DueMilestone, type KeeperRun,
} from "@/lib/api";
import { formatAddress, formatAmount, stellarExpertUrl } from "@/lib/config";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - Date.parse(dateStr);
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function overdueLabel(deadline: number): string {
  const diff = Date.now() - deadline * 1000;
  const m    = Math.floor(diff / 60000);
  if (m < 60)  return `${m}m overdue`;
  const h    = Math.floor(m / 60);
  if (h < 24)  return `${h}h overdue`;
  return `${Math.floor(h / 24)}d overdue`;
}

// ─── Due Milestone Card ───────────────────────────────────────────────────────

function DueMilestoneCard({
  ms, onExecute, busy,
}: {
  ms: DueMilestone;
  onExecute: (ms: DueMilestone) => void;
  busy: boolean;
}) {
  const deadline = ms.status === "Funded"
    ? Number(ms.delivery_deadline)
    : Number(ms.review_deadline);

  const action = ms.status === "Funded" ? "Refund" : "Release";
  const actionColor = ms.status === "Funded" ? "text-apple-red" : "text-apple-green";

  return (
    <Card className="border border-apple-amber/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-apple-amber/15 flex items-center justify-center shrink-0 mt-0.5">
            <Clock size={14} className="text-apple-amber" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">
                {formatAmount(BigInt(ms.amount))}
              </span>
              <StatusBadge status={ms.status} size="sm" />
              <span className={`text-xs font-medium ${actionColor}`}>
                → {action}
              </span>
            </div>
            <p className="text-xs text-apple-amber mt-0.5">
              {overdueLabel(deadline)}
            </p>
            <div className="flex items-center gap-2 text-xs text-apple-text-tertiary mt-1">
              <span>Ag. #{ms.agreement_id}</span>
              <span>·</span>
              <span>M{ms.milestone_index + 1}</span>
              {Number(ms.keeper_bounty) > 0 && (
                <>
                  <span>·</span>
                  <span className="text-apple-green">
                    Bounty {formatAmount(BigInt(ms.keeper_bounty))}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-xs font-mono text-apple-text-tertiary">
              <span>{formatAddress(ms.payer, 5)}</span>
              <span>→</span>
              <span>{formatAddress(ms.provider, 5)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          <Button
            size="sm"
            icon={<Zap size={13} />}
            loading={busy}
            onClick={() => onExecute(ms)}
          >
            Execute
          </Button>
          <Link href={`/agreements/${ms.agreement_id}`}>
            <Button variant="secondary" size="sm" icon={<ExternalLink size={12} />}>
              Detail
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

// ─── Keeper Run Row ───────────────────────────────────────────────────────────

function RunRow({ run }: { run: KeeperRun }) {
  const success = run.status === "success";
  return (
    <div className="flex items-start gap-3 py-3 border-b border-apple-separator last:border-0">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5
        ${success ? "bg-apple-green/15" : "bg-apple-red/15"}`}>
        {success
          ? <CheckCircle2 size={11} className="text-apple-green" />
          : <XCircle size={11} className="text-apple-red" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-white font-medium capitalize">
              {run.action} — Ag.#{run.agreement_id} M{run.milestone_index + 1}
            </p>
            {run.bounty_earned && Number(run.bounty_earned) > 0 && (
              <p className="text-xs text-apple-green mt-0.5">
                +{formatAmount(BigInt(run.bounty_earned))} bounty
              </p>
            )}
            {run.error && (
              <p className="text-xs text-apple-red mt-0.5 truncate">{run.error}</p>
            )}
            {run.tx_hash && (
              <a
                href={stellarExpertUrl(run.tx_hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-apple-blue hover:text-apple-blue/80 mt-0.5"
              >
                {run.tx_hash.slice(0, 10)}… <ExternalLink size={9} />
              </a>
            )}
          </div>
          <span className="text-xs text-apple-text-tertiary shrink-0">
            {timeAgo(run.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KeeperPage() {
  const { isConnected, publicKey, connect, getSigner } = useWallet();

  const [status, setStatus]       = useState<KeeperStatus | null>(null);
  const [due, setDue]             = useState<DueMilestone[]>([]);
  const [runs, setRuns]           = useState<KeeperRun[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId]       = useState<string | null>(null);
  const [txResults, setTxResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [ks, kd, kr] = await Promise.allSettled([
      getKeeperStatus(),
      getKeeperDue(),
      getKeeperRuns(15),
    ]);

    if (ks.status === "fulfilled") setStatus(ks.value);
    if (kd.status === "fulfilled") setDue(kd.value);
    if (kr.status === "fulfilled") setRuns(kr.value);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const handleExecute = async (ms: DueMilestone) => {
    const signer = getSigner();
    if (!signer) return;

    const key = `${ms.agreement_id}-${ms.milestone_index}`;
    setBusyId(key);

    // Use on-chain agreement ID for the contract call; fall back to DB id if indexer
    // hasn't set on_chain_id yet (shouldn't happen for funded/submitted milestones)
    const chainAgreementId = ms.agreement_on_chain_id ?? ms.agreement_id;

    try {
      await executeDueOnChain(signer, chainAgreementId, ms.milestone_index);
      setTxResults((r) => ({ ...r, [key]: { success: true } }));
      await load(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxResults((r) => ({ ...r, [key]: { success: false, error: msg } }));
    } finally {
      setBusyId(null);
    }
  };

  const totalBounties = status?.total_bounties ?? 0;
  const pendingCount  = status?.pending_milestones ?? 0;

  return (
    <AppShell
      title="Keeper Panel"
      subtitle="Execute due milestones · Earn bounties"
      action={
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="p-1.5 rounded-lg glass glass-hover text-apple-text-secondary
            hover:text-white transition-colors disabled:opacity-40"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
        </button>
      }
    >
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Pending Milestones"
          value={loading ? "—" : pendingCount}
          icon={<Clock size={16} />}
          accent="amber"
        />
        <StatCard
          label="Total Bounties"
          value={loading ? "—" : formatAmount(totalBounties)}
          icon={<Trophy size={16} />}
          accent="green"
        />
        <StatCard
          label="Last Run"
          value={loading ? "—" : status?.last_run ? timeAgo(status.last_run.created_at) : "Never"}
          icon={<Bot size={16} />}
          accent={status?.last_run?.status === "success" ? "green" : "red"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Due milestones — 2/3 */}
        <div className="lg:col-span-2 space-y-4">

          {/* Wallet banner */}
          {!isConnected && (
            <Card className="border border-apple-blue/30 bg-apple-blue/5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-apple-blue/15 flex items-center justify-center shrink-0">
                  <Wallet size={18} className="text-apple-blue" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Connect wallet to execute</p>
                  <p className="text-xs text-apple-text-secondary mt-0.5">
                    Anyone can call execute_due and earn the keeper bounty.
                  </p>
                </div>
                <Button size="sm" onClick={connect} type="button">Connect</Button>
              </div>
            </Card>
          )}

          {isConnected && (
            <Card className="flex items-center gap-3 py-3">
              <div className="w-7 h-7 rounded-full bg-apple-green/15 flex items-center justify-center shrink-0">
                <Wallet size={13} className="text-apple-green" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-apple-text-secondary">Keeper wallet</p>
                <p className="font-mono text-xs text-white truncate">{publicKey}</p>
              </div>
            </Card>
          )}

          {/* Due milestones list */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">
                Due Milestones
                {due.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full bg-apple-amber/20 text-apple-amber text-xs font-medium">
                    {due.length}
                  </span>
                )}
              </h2>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <div key={i} className="skeleton h-20 w-full" />)}
              </div>
            ) : due.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 rounded-2xl bg-apple-green/10 flex items-center
                  justify-center mx-auto mb-3">
                  <CheckCircle2 size={20} className="text-apple-green" />
                </div>
                <p className="text-sm text-apple-text-secondary mb-1">
                  No milestones due
                </p>
                <p className="text-xs text-apple-text-tertiary">
                  All milestones are within their deadlines.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {due.map((ms) => {
                  const key = `${ms.agreement_id}-${ms.milestone_index}`;
                  const result = txResults[key];
                  return (
                    <div key={key}>
                      {result && (
                        <div className={`flex items-center gap-2 p-2.5 rounded-xl mb-2 text-xs
                          ${result.success
                            ? "bg-apple-green/5 border border-apple-green/30 text-apple-green"
                            : "bg-apple-red/5 border border-apple-red/30 text-apple-red"}`}>
                          {result.success
                            ? <><CheckCircle2 size={12} /> Executed successfully</>
                            : <><XCircle size={12} /> {result.error}</>}
                        </div>
                      )}
                      <DueMilestoneCard
                        ms={ms}
                        onExecute={isConnected ? handleExecute : () => connect()}
                        busy={busyId === key}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Info box */}
          <Card className="border border-apple-surface-3">
            <div className="flex items-start gap-3">
              <AlertTriangle size={14} className="text-apple-amber shrink-0 mt-0.5" />
              <div className="text-xs text-apple-text-secondary space-y-1">
                <p className="font-medium text-white">How the Keeper works</p>
                <p>The keeper bot runs automatically every minute checking for expired milestones.</p>
                <p>
                  Anyone can call <code className="text-apple-blue bg-apple-blue/10 px-1 rounded">execute_due()</code> manually
                  and earn the keeper bounty set by the payer.
                </p>
                <p>A <span className="text-apple-red">Funded</span> milestone past delivery deadline → refund to payer.</p>
                <p>A <span className="text-apple-amber">Submitted</span> milestone past review deadline → release to provider.</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Recent runs — 1/3 */}
        <div>
          <Card className="h-full">
            <h2 className="text-base font-semibold text-white mb-4">Recent Runs</h2>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="skeleton h-12 w-full" />)}
              </div>
            ) : runs.length === 0 ? (
              <div className="text-center py-8">
                <Bot size={20} className="text-apple-text-tertiary mx-auto mb-2" />
                <p className="text-xs text-apple-text-tertiary">No runs yet</p>
              </div>
            ) : (
              <div className="-mx-5 px-5">
                {runs.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
