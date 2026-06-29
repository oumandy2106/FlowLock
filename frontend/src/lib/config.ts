export const config = {
  contractId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org",
  horizonUrl: process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001",
  apiKey: process.env.NEXT_PUBLIC_API_KEY ?? "",
  xlmContractId: process.env.NEXT_PUBLIC_XLM_CONTRACT_ID ?? "",
  usdcContractId: process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ?? "",
  network: "testnet" as const,
  networkPassphrase: "Test SDF Network ; September 2015",
} as const;

export function formatAddress(address: string, chars = 6): string {
  if (!address) return "";
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function stroopsToXlm(stroops: bigint | number): string {
  const value = typeof stroops === "bigint" ? Number(stroops) : stroops;
  return (value / 10_000_000).toFixed(7).replace(/\.?0+$/, "");
}

export function xlmToStroops(xlm: number | string): bigint {
  return BigInt(Math.round(Number(xlm) * 10_000_000));
}

export function formatAmount(stroops: bigint | number): string {
  return stroopsToXlm(stroops) + " XLM";
}

export function tsToDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

export function stellarExpertUrl(txHash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}
