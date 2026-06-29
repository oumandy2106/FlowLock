import { contract, Keypair, Networks, rpc } from "@stellar/stellar-sdk";
import type { contract as contractTypes } from "@stellar/stellar-sdk";

export type SignTransaction = contractTypes.SignTransaction;

export interface WalletSigner {
  publicKey: string;
  signTransaction: SignTransaction;
}

export function createNodeSigner(
  secretKey: string,
  networkPassphrase: string,
): WalletSigner {
  const keypair = Keypair.fromSecret(secretKey);
  const { signTransaction } = contract.basicNodeSigner(
    keypair,
    networkPassphrase,
  );
  return {
    publicKey: keypair.publicKey(),
    signTransaction,
  };
}

export function getNetworkPassphrase(
  network: "testnet" | "mainnet",
): string {
  return network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;
}
