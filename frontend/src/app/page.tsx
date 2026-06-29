"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, ArrowRight, Zap, Bot, FileText,
  RefreshCw, ExternalLink, Activity,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, StatCard } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  listAgreements,
  getEvents,
  getKeeperStatus,
  type AgreementRow,
  type EventRow,
  type KeeperStatus,
} from "@/lib/api";
import { formatAddress, formatAmount, stellarExpertUrl } from "@/lib/config";

const EVENT_LABELS: Record<string, string> = {
  AgreementCreated:       "Agreement created",
  MilestoneFunded:        "Milestone funded",
  WorkSubmitted:          "Work submitted",
  AutoReleased:           "Auto-released",
  RefundExecuted:         "Refund executed",
  DisputeOpened:          "Dispute opened",
  MutualResolutionReached:"Mutual resolution",
  SplitPaid:              "Split paid",
  KeeperPaid:             "Keeper paid",
  AgreementCancelled:     "Agreement cancelled",
};

const EVENT_COLOR: Record<string, string> = {
  AgreementCreated:       "text-apple-blue",
  MilestoneFunded:        "text-apple-blue",
  WorkSubmitted:          "text-apple-amber",
  AutoReleased:           "text-apple-green",
  RefundExecuted:         "text-apple-red",
  DisputeOpened:          "text-apple-orange",
  MutualResolutionReached:"text-apple-purple",
  SplitPaid:              "text-apple-green",
  KeeperPaid:             "text-apple-green",
  AgreementCancelled:     "text-apple-gray",
};

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

export default function DashboardPage() {
  const [agreements, setAgreements] = useState<AgreementRow[]>([]);
  const [events, setEvents]         = useState<EventRow[]>([]);
  const [keeper, setKeeper]         = useState<KeeperStatus | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [ags, evs, ks] = await Promise.allSettled([
      listAgreements({ limit: 20 }),
      getEvents({ limit: 10 }).catch(() => [] as EventRow[]),
      getKeeperStatus(),
    ]);

    if (ags.status === "fulfilled") setAgreements(ags.value);
    if (evs.status === "fulfilled") setEvents(evs.value as EventRow[]);
    if (ks.status  === "fulfilled") setKeeper(ks.value);

    setLoading(false);
    setRefreshing(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const total     = agreements.length;
  const active    = agreements.filter((a) => a.status === "Active").length;
  const completed = agreements.filter((a) => a.status === "Completed").length;
  const cancelled = agreements.filter((a) => a.status === "Cancelled").length;

  return (
    <AppShell
      title="Dashboard"
      subtitle="FlowLock Protocol — Stellar Testnet"
      action={
        <Link href="/agreements/new">
          <Button size="sm" icon={<Plus size={14} />}>New Agreement</Button>
        </Link>
      }
    >
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Agreements" value={loading ? "—" : total}     icon={<FileText size={16} />} accent="blue"  />
        <StatCard label="Active"           value={loading ? "—" : active}    icon={<Zap size={16} />}      accent="amber" />
        <StatCard label="Completed"        value={loading ? "—" : completed} icon={<Zap size={16} />}      accent="green" />
        <StatCard label="Keeper Pending"   value={loading ? "—" : (keeper?.pending_milestones ?? 0)} icon={<Bot size={16} />} accent="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Agreements list — 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">Agreements</h2>
              <div className="flex items-center gap-2">
                {lastRefresh && (
                  <span className="text-xs text-apple-text-tertiary hidden sm:block">
                    Updated {timeAgo(lastRefresh.toISOString())}
                  </span>
                )}
                <button
                  onClick={() => load(true)}
                  disabled={refreshing}
                  className="p-1.5 rounded-lg glass glass-hover text-apple-text-secondary
                    hover:text-white transition-colors disabled:opacity-40"
                  title="Refresh"
                >
                  <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
                </button>
                <Link href="/agreements/new">
                  <Button variant="secondary" size="sm" icon={<Plus size={13} />}>New</Button>
                </Link>
              </div>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 w-full" />)}
              </div>
            ) : agreements.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-2xl bg-apple-blue/10 flex items-center
                  justify-center mx-auto mb-3">
                  <FileText size={20} className="text-apple-blue" />
                </div>
                <p className="text-apple-text-secondary text-sm mb-1">No agreements yet</p>
                <p className="text-apple-text-tertiary text-xs mb-4">
                  Create one to start using FlowLock
                </p>
                <Link href="/agreements/new">
                  <Button size="sm" icon={<Plus size={14} />}>Create agreement</Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-apple-separator -mx-5">
                {agreements.map((ag) => (
                  <Link
                    key={ag.id}
                    href={`/agreements/${ag.id}`}
                    className="flex items-center justify-between py-3.5 px-5
                      hover:bg-white/[0.03] transition-colors group"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="text-xs font-mono text-apple-text-tertiary w-6 shrink-0">
                        #{ag.on_chain_id ?? ag.id}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-mono truncate">
                            {formatAddress(ag.payer, 5)}
                          </span>
                          <ArrowRight size={11} className="text-apple-text-tertiary shrink-0" />
                          <span className="text-sm text-apple-text-secondary font-mono truncate">
                            {formatAddress(ag.provider, 5)}
                          </span>
                        </div>
                        <p className="text-xs text-apple-text-tertiary mt-0.5">
                          {ag.milestone_count} milestone{ag.milestone_count !== 1 ? "s" : ""}
                          {" · "}
                          {new Date(ag.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      <StatusBadge status={ag.status} size="sm" />
                      <ArrowRight
                        size={13}
                        className="text-apple-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Keeper status */}
          {keeper && (
            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <p className="section-title">Keeper Bot</p>
                  <div className="flex items-center gap-8 mt-2">
                    <div>
                      <p className="text-xs text-apple-text-secondary">Pending milestones</p>
                      <p className="text-2xl font-bold text-apple-amber mt-0.5">
                        {keeper.pending_milestones}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-apple-text-secondary">Total bounties earned</p>
                      <p className="text-2xl font-bold text-apple-green mt-0.5">
                        {formatAmount(keeper.total_bounties)}
                      </p>
                    </div>
                    {keeper.last_run && (
                      <div>
                        <p className="text-xs text-apple-text-secondary">Last run</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              keeper.last_run.status === "success"
                                ? "bg-apple-green"
                                : "bg-apple-red"
                            }`}
                          />
                          <p className="text-sm text-white capitalize">
                            {keeper.last_run.status}
                          </p>
                        </div>
                        <p className="text-xs text-apple-text-tertiary mt-0.5">
                          {timeAgo(keeper.last_run.created_at)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <Link href="/keeper">
                  <Button variant="secondary" size="sm" icon={<Bot size={13} />}>
                    View Keeper
                  </Button>
                </Link>
              </div>
            </Card>
          )}
        </div>

        {/* Events feed — 1/3 */}
        <div>
          <Card className="h-full">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={14} className="text-apple-blue" />
              <h2 className="text-base font-semibold text-white">Live Events</h2>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-10 w-full" />)}
              </div>
            ) : events.length === 0 ? (
              <div className="text-center py-8">
                <Activity size={20} className="text-apple-text-tertiary mx-auto mb-2" />
                <p className="text-xs text-apple-text-tertiary">
                  No events yet
                </p>
                <p className="text-xs text-apple-text-tertiary mt-1">
                  (requires API key)
                </p>
              </div>
            ) : (
              <div className="space-y-1 -mx-5">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 px-5 py-2.5
                      hover:bg-white/[0.03] transition-colors"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0
                        ${EVENT_COLOR[ev.event_type] ?? "text-apple-gray"}
                        bg-current`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-medium ${EVENT_COLOR[ev.event_type] ?? "text-apple-text-secondary"}`}>
                          {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                        </p>
                        <span className="text-xs text-apple-text-tertiary shrink-0">
                          {timeAgo(ev.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-apple-text-tertiary mt-0.5">
                        Agreement #{ev.agreement_id}
                        {ev.milestone_index != null && ` · M${ev.milestone_index}`}
                      </p>
                      {ev.tx_hash && (
                        <a
                          href={stellarExpertUrl(ev.tx_hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-apple-blue
                            hover:text-apple-blue/80 transition-colors mt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ev.tx_hash.slice(0, 8)}…
                          <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {[
          { href: "/agreements/new", label: "Create Agreement", icon: Plus,       color: "text-apple-blue",   bg: "bg-apple-blue/10" },
          { href: "/payer",          label: "Fund Milestone",   icon: Zap,        color: "text-apple-amber",  bg: "bg-apple-amber/10" },
          { href: "/provider",       label: "Submit Work",      icon: FileText,   color: "text-apple-green",  bg: "bg-apple-green/10" },
          { href: "/keeper",         label: "Run Keeper",       icon: Bot,        color: "text-apple-purple", bg: "bg-apple-purple/10" },
        ].map(({ href, label, icon: Icon, color, bg }) => (
          <Link key={href} href={href}>
            <Card hover className="flex flex-col items-center justify-center gap-2 py-4 text-center">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon size={16} className={color} />
              </div>
              <span className="text-xs font-medium text-apple-text-secondary">{label}</span>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
