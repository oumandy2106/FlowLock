import type {
  SoroswapQuoteRequest,
  SoroswapQuoteResponse,
  SoroswapBuildResponse,
} from "./types.js";

const DEFAULT_SOROSWAP_URL = "https://api.soroswap.finance";

export class SoroswapClient {
  private baseUrl: string;
  private network: "testnet" | "mainnet";

  constructor(network: "testnet" | "mainnet", baseUrl?: string) {
    this.baseUrl = baseUrl ?? DEFAULT_SOROSWAP_URL;
    this.network = network;
  }

  async quoteFunding(
    inputAsset: string,
    settlementAsset: string,
    amount: string,
  ): Promise<SoroswapQuoteResponse> {
    const body: SoroswapQuoteRequest = {
      assetIn: inputAsset,
      assetOut: settlementAsset,
      amount,
      tradeType: "EXACT_IN",
      protocols: ["soroswap", "aqua"],
      slippageBps: 50,
    };

    const res = await fetch(
      `${this.baseUrl}/quote?network=${this.network}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      throw new Error(`Soroswap quote failed: ${res.status} ${await res.text()}`);
    }

    return res.json() as Promise<SoroswapQuoteResponse>;
  }

  async buildSwapXdr(
    quote: SoroswapQuoteResponse,
    from: string,
    to?: string,
  ): Promise<string> {
    const body: Record<string, unknown> = { quote, from };
    if (to) body.to = to;

    const res = await fetch(
      `${this.baseUrl}/quote/build?network=${this.network}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      throw new Error(`Soroswap build failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as SoroswapBuildResponse;
    return data.xdr;
  }
}
