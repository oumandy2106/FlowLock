"use client";

import { useState, useCallback, useEffect } from "react";
import { config } from "@/lib/config";
import type { WalletSigner } from "@/lib/stellar";

interface WalletState {
  isConnected: boolean;
  publicKey: string | null;
  isConnecting: boolean;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    publicKey: null,
    isConnecting: false,
    error: null,
  });

  // Restore session on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("fl_wallet");
    if (stored) {
      setState((s) => ({ ...s, isConnected: true, publicKey: stored }));
    }
  }, []);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isConnecting: true, error: null }));
    try {
      const freighter = await import("@stellar/freighter-api");

      const connected = await freighter.isConnected();
      if (!connected) {
        throw new Error("Freighter extension not found. Please install it.");
      }

      await freighter.setAllowed();

      const { address } = await freighter.getAddress();
      if (!address) throw new Error("Could not get address from Freighter.");

      sessionStorage.setItem("fl_wallet", address);
      setState({ isConnected: true, publicKey: address, isConnecting: false, error: null });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect wallet";
      setState((s) => ({ ...s, isConnecting: false, error: msg }));
    }
  }, []);

  const disconnect = useCallback(() => {
    sessionStorage.removeItem("fl_wallet");
    setState({ isConnected: false, publicKey: null, isConnecting: false, error: null });
  }, []);

  const getSigner = useCallback((): WalletSigner | null => {
    if (!state.publicKey) return null;
    return {
      publicKey: state.publicKey,
      signTransaction: async (xdr: string) => {
        const freighter = await import("@stellar/freighter-api");
        const result = await freighter.signTransaction(xdr, {
          networkPassphrase: config.networkPassphrase,
          address: state.publicKey!,
        });
        return { signedTxXdr: result.signedTxXdr };
      },
    };
  }, [state.publicKey]);

  return {
    ...state,
    connect,
    disconnect,
    getSigner,
  };
}
