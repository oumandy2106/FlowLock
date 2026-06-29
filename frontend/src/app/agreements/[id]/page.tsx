"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ExternalLink, Copy, CheckCheck, RefreshCw,
  Clock, User, Zap, ChevronDown, ChevronUp, Hash,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import {
  getAgreement, getMilestones, getEvents,
  type AgreementRow, type MilestoneRow, type EventRow,
} from "@/lib/api";
import {
  formatAddress, formatAmount, config, stellarExpertUrl,
} from "@/lib/config";

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

const EVENT_LABELS: Record<string, string> = {
  AgreementCreated:        "Agreement created",
  MilestoneFunded:         "Milestone funded",
  WorkSubmitted:           "Work submitted",
  AutoReleased:            "Auto-released by keeper",
  RefundExecuted:          "Refund executed",
  DisputeOpened:           "Dispute opened",
  MutualResolutionReached: "Mutual resolution reached",
  SplitPaid:               "Split paid",
  KeeperPaid:              "Keeper paid",
  AgreementCancelled:      "Agreement cancelled",
};

const EVENT_DOT: Record<string, string> = {
  AgreementCreated:        "bg-apple-blue",
  MilestoneFunded:         "bg-apple-blue",
  WorkSubmitted:           "bg-apple-amber",
  AutoReleased:            "bg-apple-green",
  RefundExecuted:          "bg-apple-red",
  DisputeOpened:           "bg-apple-orange",
  MutualResolutionReached: "bg-apple-purple",
  SplitPaid:               "bg-apple-green",
  KeeperPaid:              "bg-apple-green",
  AgreementCancelled:      "bg-apple-gray",
};

// ─── CopyButton ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="p-1 rounded text-apple-text-tertiary hover:text-white transition-colors shrink-0"
    >
      {copied
        ? <CheckCheck size={11} className="text-apple-green" />
        : <Copy size={11} />}
    </button>
  );
}

// ─── AddressRow ───────────────────────────────────────────────────────────────

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-apple-separator last:border-0">
      <span className="text-xs text-apple-text-secondary w-24 shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-0">
        <span className="font-mono text-xs text-white truncate">{address}</span>
        <CopyButton text={address} />
      </div>
    </div>
  );
}

// ─── MilestoneCard ────────────────────────────────────────────────────────────

function MilestoneCard({ ms, index, events }: {
  ms: MilestoneRow;
  index: number;
  events: EventRow[];
}) {
  const [open, setOpen] = useState(index === 0);
  const mEvents = events.filter((e) => e.milestone_index === ms.milestone_index);

  const deliveryTs = Number(ms.delivery_deadline) * 1000;
  const reviewTs   = Number(ms.review_deadline)   * 1000;
  const now        = Date.now();
  const deliveryExpired = now > deliveryTs;
  const reviewExpired   = now > reviewTs;
  const statusActive = ["Funded", "Submitted", "Disputed"].includes(ms.status);

  return (
    <Card className={`border ${statusActive ? "border-apple-blue/30" : "border-apple-separator"}`}>
      <button
        type="button"
        className="flex items-center justify-between w-full text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0
            ${statusActive ? "bg-apple-blue/20 text-apple-blue" : "bg-apple-surface-2 text-apple-text-secondary"}`}>
            {index + 1}
          </span>
          <div className="text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-white">
                {formatAmount(BigInt(ms.amount))}
              </span>
              <StatusBadge status={ms.status} size="sm" />
            </div>
            <p className="text-xs text-apple-text-tertiary mt-0.5">
              Due {new Date(deliveryTs).toLocaleDateString()}
              {Number(ms.keeper_bounty) > 0 && ` · Bounty ${formatAmount(BigInt(ms.keeper_bounty))}`}
            </p>
          </div>
        </div>
        {open
          ? <ChevronUp size={15} className="text-apple-text-tertiary shrink-0" />
          : <ChevronDown size={15} className="text-apple-text-tertiary shrink-0" />}
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* Deadlines */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Delivery deadline", ts: deliveryTs, expired: deliveryExpired },
              { label: "Review deadline",   ts: reviewTs,   expired: reviewExpired   },
            ].map(({ label, ts, expired }) => (
              <div key={label} className="surface rounded-xl p-3">
                <p className="text-xs text-apple-text-tertiary mb-1 flex items-center gap-1">
                  <Clock size={10} /> {label}
                </p>
                <p className={`text-xs font-medium ${expired ? "text-apple-red" : "text-white"}`}>
                  {expired ? "Expired · " : ""}
                  {new Date(ts).toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          {/* Splits */}
          {ms.splits?.length > 0 && (
            <div>
              <p className="text-xs text-apple-text-tertiary mb-2">Payment splits</p>
              <div className="space-y-1.5">
                {ms.splits.map((sp, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User size={10} className="text-apple-text-tertiary shrink-0" />
                      <span className="font-mono text-apple-text-secondary truncate">
                        {formatAddress(sp.recipient, 8)}
                      </span>
                      <CopyButton text={sp.recipient} />
                    </div>
                    <span className="text-apple-green font-medium shrink-0 ml-2">
                      {(sp.bps / 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata hash */}
          {ms.metadata_hash && (
            <div>
              <p className="text-xs text-apple-text-tertiary mb-1 flex items-center gap-1">
                <Hash size={10} /> Work submission hash
              </p>
              <div className="flex items-center gap-1">
                <span className="font-mono text-xs text-white break-all">{ms.metadata_hash}</span>
                <CopyButton text={ms.metadata_hash} />
              </div>
            </div>
          )}

          {/* Milestone events */}
          {mEvents.length > 0 && (
            <div>
              <p className="text-xs text-apple-text-tertiary mb-2">Events</p>
              <div className="space-y-2">
                {mEvents.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${EVENT_DOT[ev.event_type] ?? "bg-apple-gray"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-white">{EVENT_LABELS[ev.event_type] ?? ev.event_type}</p>
                        <span className="text-xs text-apple-text-tertiary shrink-0">{timeAgo(ev.created_at)}</span>
                      </div>
                      {ev.tx_hash && (
                        <a
                          href={stellarExpertUrl(ev.tx_hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-apple-blue hover:text-apple-blue/80 transition-colors mt-0.5"
                        >
                          {ev.tx_hash.slice(0, 10)}… <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgreementDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [agreement, setAgreement]   = useState<AgreementRow | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);
  const [events, setEvents]         = useState<EventRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [ag, ms, evs] = await Promise.allSettled([
      getAgreement(id),
      getMilestones(id),
      getEvents({ agreement_id: Number(id), limit: 50 }).catch(() => [] as EventRow[]),
    ]);

    if (ag.status  === "fulfilled") setAgreement(ag.value);
    else setError("Agreement not found.");
    if (ms.status  === "fulfilled") setMilestones(ms.value);
    if (evs.status === "fulfilled") setEvents(evs.value as EventRow[]);

    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const assetLabel =
    agreement?.settlement_asset === config.xlmContractId  ? "XLM (Native)" :
    agreement?.settlement_asset === config.usdcContractId ? "USDC"         :
    formatAddress(agreement?.settlement_asset ?? "", 6);

  if (!loading && error) {
    return (
      <AppShell title="Agreement">
        <div className="text-center py-20">
          <p className="text-apple-text-secondary">{error}</p>
          <Link href="/" className="mt-4 inline-block">
            <Button variant="secondary" size="sm" icon={<ArrowLeft size={13} />}>Back</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title="Agreement">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="skeleton h-44 w-full rounded-2xl" />
          <div className="skeleton h-32 w-full rounded-2xl" />
          <div className="skeleton h-32 w-full rounded-2xl" />
        </div>
      </AppShell>
    );
  }

  if (!agreement) return null;

  const totalAmount = milestones.reduce((sum, m) => sum + BigInt(m.amount), BigInt(0));

  const statusCounts = milestones.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});

  const chainId = agreement.on_chain_id ?? agreement.id;

  return (
    <AppShell
      title={`Agreement #${chainId}`}
      subtitle={`${agreement.milestone_count} milestone${agreement.milestone_count !== 1 ? "s" : ""} · ${assetLabel}`}
      action={
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="p-1.5 rounded-lg glass glass-hover text-apple-text-secondary
              hover:text-white transition-colors disabled:opacity-40"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </button>
          <Link href="/">
            <Button variant="secondary" size="sm" icon={<ArrowLeft size={13} />}>Back</Button>
          </Link>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Overview card */}
        <Card>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white mb-1">Overview</h2>
              <StatusBadge status={agreement.status} />
            </div>
            <div className="text-right">
              <p className="text-xs text-apple-text-tertiary">Total value</p>
              <p className="text-xl font-bold text-white mt-0.5">{formatAmount(totalAmount)}</p>
              <p className="text-xs text-apple-text-tertiary mt-0.5">{assetLabel}</p>
            </div>
          </div>

          <div className="divide-y divide-apple-separator">
            <AddressRow label="Payer"       address={agreement.payer} />
            <AddressRow label="Provider"    address={agreement.provider} />
            {agreement.platform && (
              <AddressRow label="Platform"  address={agreement.platform} />
            )}
            <AddressRow label="Asset"       address={agreement.settlement_asset} />
          </div>

          {Object.keys(statusCounts).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-apple-separator">
              {Object.entries(statusCounts).map(([status, count]) => (
                <div key={status} className="flex items-center gap-1">
                  <StatusBadge status={status} size="sm" />
                  <span className="text-xs text-apple-text-tertiary">×{count}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-apple-text-tertiary mt-3">
            Created {new Date(agreement.created_at).toLocaleString()}
          </p>
        </Card>

        {/* Milestones */}
        <div>
          <h2 className="text-xs font-semibold text-apple-text-secondary uppercase tracking-wider mb-3 px-1">
            Milestones
          </h2>
          <div className="space-y-3">
            {milestones.length === 0 ? (
              <Card>
                <p className="text-sm text-apple-text-secondary text-center py-4">
                  No milestones found.
                </p>
              </Card>
            ) : (
              milestones.map((ms, i) => (
                <MilestoneCard key={ms.id} ms={ms} index={i} events={events} />
              ))
            )}
          </div>
        </div>

        {/* Event timeline */}
        {events.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-apple-text-secondary uppercase tracking-wider mb-3 px-1">
              Event Timeline
            </h2>
            <Card>
              <div className="relative">
                <div className="absolute left-[6px] top-2 bottom-2 w-px bg-apple-separator" />
                <div className="space-y-5">
                  {events.map((ev) => (
                    <div key={ev.id} className="flex gap-4 relative">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 border-apple-bg shrink-0 mt-0.5 z-10
                        ${EVENT_DOT[ev.event_type] ?? "bg-apple-gray"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-white font-medium">
                            {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                          </p>
                          <span className="text-xs text-apple-text-tertiary shrink-0">
                            {timeAgo(ev.created_at)}
                          </span>
                        </div>
                        {ev.milestone_index != null && (
                          <p className="text-xs text-apple-text-tertiary mt-0.5">
                            Milestone #{ev.milestone_index + 1}
                          </p>
                        )}
                        {ev.tx_hash && (
                          <a
                            href={stellarExpertUrl(ev.tx_hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-apple-blue
                              hover:text-apple-blue/80 transition-colors mt-1"
                          >
                            <Zap size={10} />
                            {ev.tx_hash.slice(0, 12)}…{ev.tx_hash.slice(-6)}
                            <ExternalLink size={10} />
                          </a>
                        )}
                        {ev.ledger > 0 && (
                          <p className="text-xs text-apple-text-tertiary mt-0.5">
                            Ledger {ev.ledger}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Action shortcuts */}
        <div className="grid grid-cols-2 gap-3 pb-8">
          <Link href={`/payer?agreement=${chainId}`}>
            <Card hover className="text-center py-3">
              <p className="text-xs font-medium text-apple-amber">Payer Actions</p>
              <p className="text-xs text-apple-text-tertiary mt-0.5">Fund · Approve release</p>
            </Card>
          </Link>
          <Link href={`/provider?agreement=${chainId}`}>
            <Card hover className="text-center py-3">
              <p className="text-xs font-medium text-apple-green">Provider Actions</p>
              <p className="text-xs text-apple-text-tertiary mt-0.5">Submit work</p>
            </Card>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
