"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Plus,
  FileText,
  CreditCard,
  Briefcase,
  Bot,
  Zap,
} from "lucide-react";

const NAV = [
  { href: "/",          label: "Dashboard",  icon: LayoutDashboard },
  { href: "/agreements/new", label: "New Agreement", icon: Plus },
  { href: "/payer",     label: "Payer",      icon: CreditCard },
  { href: "/provider",  label: "Provider",   icon: Briefcase },
  { href: "/keeper",    label: "Keeper",     icon: Bot },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[220px] flex flex-col
      bg-apple-surface border-r border-apple-separator z-30">

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-apple-separator">
        <div className="w-7 h-7 rounded-lg bg-apple-blue flex items-center justify-center shrink-0">
          <Zap size={14} className="text-white" fill="white" />
        </div>
        <span className="text-base font-semibold text-white tracking-tight">FlowLock</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/"
            ? pathname === "/"
            : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-150 group
                ${active
                  ? "bg-apple-blue/15 text-apple-blue"
                  : "text-apple-text-secondary hover:text-white hover:bg-white/5"
                }`}
            >
              <Icon
                size={16}
                className={`shrink-0 transition-colors ${active ? "text-apple-blue" : "text-apple-text-tertiary group-hover:text-white"}`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-apple-separator">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-apple-green animate-pulse" />
          <span className="text-xs text-apple-text-tertiary">Stellar Testnet</span>
        </div>
        <p className="text-xs text-apple-text-tertiary mt-1 font-mono">
          FlowLock v0.1.0
        </p>
      </div>
    </aside>
  );
}
