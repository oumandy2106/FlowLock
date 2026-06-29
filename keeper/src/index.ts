import "dotenv/config";
import { contract, Keypair, Networks } from "@stellar/stellar-sdk";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/flowlock",
});

const CONTRACT_ID =
  process.env.FLOWLOCK_CONTRACT_ID ??
  "CB4VDJ5NYOQLTNCWOLKA3IR7NRFDUXVRAAWVW6GG7KABEOENFOHY3ETV";

const RPC_URL =
  process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";

const NETWORK_PASSPHRASE = Networks.TESTNET;

const KEEPER_SECRET = process.env.KEEPER_SECRET_KEY;

const POLL_INTERVAL_MS = Number(process.env.KEEPER_INTERVAL_MS ?? 30000);

async function getContractClient() {
  if (!KEEPER_SECRET) {
    throw new Error("KEEPER_SECRET_KEY environment variable is required");
  }

  const keypair = Keypair.fromSecret(KEEPER_SECRET);
  const { signTransaction } = contract.basicNodeSigner(
    keypair,
    NETWORK_PASSPHRASE,
  );

  return {
    client: await contract.Client.from({
      contractId: CONTRACT_ID,
      rpcUrl: RPC_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      publicKey: keypair.publicKey(),
      signTransaction,
    }),
    publicKey: keypair.publicKey(),
  };
}

async function executeDue(
  contractClient: any,
  keeperPublicKey: string,
  onChainAgreementId: number,
  milestoneIndex: number,
  action: string,
): Promise<{ txHash: string; bounty: number } | null> {
  try {
    const tx = await contractClient.execute_due({
      agreement_id: onChainAgreementId,
      milestone_id: milestoneIndex,
      caller: keeperPublicKey,
    });

    const sent = await tx.signAndSend();

    const txHash = sent.hash ?? "unknown";
    const bounty = 0; // extracted from events in production

    console.log(
      `[Keeper] ${action} executed — agreement=${onChainAgreementId} milestone=${milestoneIndex} tx=${txHash}`,
    );

    return { txHash, bounty };
  } catch (err: any) {
    const message = err.message ?? String(err);

    if (
      message.includes("#2") ||
      message.includes("InvalidState") ||
      message.includes("#3") ||
      message.includes("DeadlineNotReached")
    ) {
      console.log(
        `[Keeper] Skipping — agreement=${onChainAgreementId} milestone=${milestoneIndex}: ${message.slice(0, 100)}`,
      );
      return null;
    }

    throw err;
  }
}

async function processKeeper(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  const refundCandidates = await pool.query(
    `SELECT m.milestone_index, a.on_chain_id
     FROM milestones m
     JOIN agreements a ON a.id = m.agreement_id
     WHERE m.status = 'Funded'
     AND m.delivery_deadline < $1
     AND a.on_chain_id IS NOT NULL`,
    [now],
  );

  const releaseCandidates = await pool.query(
    `SELECT m.milestone_index, a.on_chain_id
     FROM milestones m
     JOIN agreements a ON a.id = m.agreement_id
     WHERE m.status = 'Submitted'
     AND m.review_deadline < $1
     AND a.on_chain_id IS NOT NULL`,
    [now],
  );

  const candidates = [
    ...refundCandidates.rows.map((r) => ({ ...r, action: "refund" })),
    ...releaseCandidates.rows.map((r) => ({ ...r, action: "auto-release" })),
  ];

  if (candidates.length === 0) return;

  console.log(`[Keeper] Found ${candidates.length} candidate(s) to process`);

  let clientData: { client: any; publicKey: string };
  try {
    clientData = await getContractClient();
  } catch (err: any) {
    console.error("[Keeper] Failed to create contract client:", err.message);
    return;
  }

  for (const c of candidates) {
    const existing = await pool.query(
      `SELECT id FROM keeper_runs
       WHERE agreement_id = $1 AND milestone_index = $2 AND status = 'success'`,
      [c.on_chain_id, c.milestone_index],
    );
    if (existing.rows.length > 0) continue;

    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        const result = await executeDue(
          clientData.client,
          clientData.publicKey,
          c.on_chain_id,
          c.milestone_index,
          c.action,
        );

        if (result) {
          await pool.query(
            `INSERT INTO keeper_runs (agreement_id, milestone_index, action, tx_hash, status, bounty_earned)
             VALUES ($1, $2, $3, $4, 'success', $5)`,
            [
              c.on_chain_id,
              c.milestone_index,
              c.action,
              result.txHash,
              result.bounty,
            ],
          );
        } else {
          await pool.query(
            `INSERT INTO keeper_runs (agreement_id, milestone_index, action, status, error)
             VALUES ($1, $2, $3, 'skipped', 'State or deadline not matching')`,
            [c.on_chain_id, c.milestone_index, c.action],
          );
        }

        break;
      } catch (err: any) {
        retries++;
        console.error(
          `[Keeper] Error (attempt ${retries}/${maxRetries}) — agreement=${c.on_chain_id}: ${err.message}`,
        );

        if (retries >= maxRetries) {
          await pool.query(
            `INSERT INTO keeper_runs (agreement_id, milestone_index, action, status, error)
             VALUES ($1, $2, $3, 'failed', $4)`,
            [c.on_chain_id, c.milestone_index, c.action, err.message],
          );
        } else {
          await new Promise((r) =>
            setTimeout(r, 1000 * Math.pow(2, retries)),
          );
        }
      }
    }
  }
}

async function main(): Promise<void> {
  console.log("[Keeper] Starting keeper bot...");
  console.log(`[Keeper] Contract: ${CONTRACT_ID}`);
  console.log(`[Keeper] Poll interval: ${POLL_INTERVAL_MS}ms`);

  const poll = async () => {
    try {
      await processKeeper();
    } catch (err: any) {
      console.error("[Keeper] Unhandled error:", err.message);
    }
    setTimeout(poll, POLL_INTERVAL_MS);
  };

  poll();
}

main().catch(console.error);
