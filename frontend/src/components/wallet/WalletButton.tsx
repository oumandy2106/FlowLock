"use client";

import { Wallet, LogOut, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { formatAddress } from "@/lib/config";
import { Spinner } from "@/components/ui/Spinner";

export function WalletButton() {
  const { isConnected, publicKey, isConnecting, connect, disconnect } = useWallet();
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (!publicKey) return;
    await navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isConnecting) {
    return (
      <button className="btn-secondary flex items-center gap-2 text-sm" disabled>
        <Spinner size="sm" />
        Connecting…
      </button>
    );
  }

  if (isConnected && publicKey) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={copyAddress}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass glass-hover text-sm text-apple-text-secondary hover:text-white transition-colors"
          title="Copy address"
        >
          <Wallet size={14} className="text-apple-blue" />
          <span className="font-mono">{formatAddress(publicKey)}</span>
          {copied
            ? <Check size={12} className="text-apple-green" />
            : <Copy size={12} className="opacity-50" />}
        </button>
        <button
          onClick={disconnect}
          className="p-1.5 rounded-lg glass glass-hover text-apple-text-secondary hover:text-apple-red transition-colors"
          title="Disconnect wallet"
        >
          <LogOut size={14} />
        </button>
      </div>
    );
  }

  return (
    <button onClick={connect} className="btn-primary flex items-center gap-2 text-sm">
      <Wallet size={14} />
      Connect Freighter
    </button>
  );
}
