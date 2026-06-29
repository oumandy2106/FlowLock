import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { WalletButton } from "@/components/wallet/WalletButton";
import { NetworkBadge } from "@/components/ui/NetworkBadge";

interface AppShellProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}

export function AppShell({ children, title, subtitle, action }: AppShellProps) {
  return (
    <div className="min-h-screen bg-apple-bg flex">
      <Sidebar />

      <div className="flex-1 ml-[220px] flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between
          px-6 py-3 border-b border-apple-separator bg-apple-bg/80 backdrop-blur-xl">
          <div>
            {title && <h1 className="text-lg font-semibold text-white">{title}</h1>}
            {subtitle && <p className="text-sm text-apple-text-secondary">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3">
            <NetworkBadge />
            {action}
            <WalletButton />
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 px-6 py-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
