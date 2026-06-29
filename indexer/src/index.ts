import "dotenv/config";
import { rpc } from "@stellar/stellar-sdk";
import pg from "pg";
import { createHmac } from "crypto";

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

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 7000);

const server = new rpc.Server(RPC_URL);

const EVENT_TYPES = [
  "AgreementCreated",
  "MilestoneFunded",
  "WorkSubmitted",
  "AutoReleased",
  "RefundExecuted",
  "DisputeOpened",
  "MutualResolutionReached",
  "SplitPaid",
  "KeeperPaid",
  "AgreementCancelled",
];

let lastCursor: string | undefined;

async function loadCursor(): Promise<void> {
  const result = await pool.query(
    "SELECT MAX(ledger) as last_ledger FROM events",
  );
  if (result.rows[0]?.last_ledger) {
    lastCursor = String(result.rows[0].last_ledger);
  }
}

function parseEventType(topics: string[]): string | null {
  for (const t of topics) {
    const match = EVENT_TYPES.find(
      (et) => t.includes(et) || t.toLowerCase().includes(et.toLowerCase()),
    );
    if (match) return match;
  }
  return null;
}

function extractAgreementId(data: any): number | null {
  if (typeof data === "object" && data !== null) {
    if ("agreement_id" in data) return Number(data.agreement_id);
    if ("data" in data && typeof data.data === "object" && data.data !== null) {
      if ("agreement_id" in data.data) return Number(data.data.agreement_id);
    }
  }
  return null;
}

function extractMilestoneIndex(data: any): number | null {
  if (typeof data === "object" && data !== null) {
    if ("milestone_id" in data) return Number(data.milestone_id);
    if ("data" in data && typeof data.data === "object" && data.data !== null) {
      if ("milestone_id" in data.data)
        return Number(data.data.milestone_id);
    }
  }
  return null;
}

const STATUS_MAP: Record<string, { table: string; status: string }> = {
  MilestoneFunded: { table: "milestones", status: "Funded" },
  WorkSubmitted: { table: "milestones", status: "Submitted" },
  AutoReleased: { table: "milestones", status: "Released" },
  RefundExecuted: { table: "milestones", status: "Refunded" },
  DisputeOpened: { table: "milestones", status: "Disputed" },
  MutualResolutionReached: { table: "milestones", status: "MutualResolution" },
  AgreementCancelled: { table: "agreements", status: "Cancelled" },
};

async function updateStatus(
  eventType: string,
  agreementId: number | null,
  milestoneIndex: number | null,
): Promise<void> {
  const mapping = STATUS_MAP[eventType];
  if (!mapping || agreementId === null) return;

  if (mapping.table === "agreements") {
    await pool.query(
      "UPDATE agreements SET status = $1, updated_at = NOW() WHERE on_chain_id = $2",
      [mapping.status, agreementId],
    );
  } else if (milestoneIndex !== null) {
    await pool.query(
      `UPDATE milestones SET status = $1, updated_at = NOW()
       WHERE agreement_id = (SELECT id FROM agreements WHERE on_chain_id = $2)
       AND milestone_index = $3`,
      [mapping.status, agreementId, milestoneIndex],
    );
  }
}

async function fireWebhooks(
  eventType: string,
  payload: any,
): Promise<void> {
  const subs = await pool.query(
    `SELECT ws.*, i.name FROM webhook_subscriptions ws
     JOIN integrators i ON i.id = ws.integrator_id
     WHERE ws.active = true
     AND (ws.events_filter IS NULL OR $1 = ANY(ws.events_filter))`,
    [eventType],
  );

  for (const sub of subs.rows) {
    const body = JSON.stringify({ event_type: eventType, data: payload });
    const signature = createHmac("sha256", sub.secret_hash)
      .update(body)
      .digest("hex");

    let attempts = 0;
    const maxRetries = 3;

    while (attempts < maxRetries) {
      try {
        const res = await fetch(sub.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-FlowLock-Signature": signature,
          },
          body,
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          console.log(
            `Webhook delivered to ${sub.url} for ${eventType}`,
          );
          break;
        }

        console.warn(
          `Webhook ${sub.url} returned ${res.status}, retry ${attempts + 1}`,
        );
      } catch (err: any) {
        console.warn(
          `Webhook ${sub.url} failed: ${err.message}, retry ${attempts + 1}`,
        );
      }

      attempts++;
      if (attempts < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempts)));
      }
    }
  }
}

async function processEvents(): Promise<void> {
  try {
    const params: any = {
      filters: [
        {
          type: "contract",
          contractIds: [CONTRACT_ID],
        },
      ],
    };

    if (lastCursor) {
      params.cursor = lastCursor;
    } else {
      const latestLedger = await server.getLatestLedger();
      params.startLedger = latestLedger.sequence - 1000;
    }

    let events: any;
    try {
      events = await server.getEvents(params);
    } catch (err: any) {
      if (
        err.message?.includes("start is before") ||
        err.message?.includes("must be positive") ||
        err.message?.includes("invalid")
      ) {
        const latestLedger = await server.getLatestLedger();
        params.startLedger = latestLedger.sequence - 100;
        delete (params as any).cursor;
        lastCursor = undefined;
        events = await server.getEvents(params);
      } else {
        throw err;
      }
    }

    if (!events.events || events.events.length === 0) return;

    for (const event of events.events) {
      const topicStrings = event.topic.map((t: any) => {
        try {
          return typeof t === "string" ? t : JSON.stringify(t);
        } catch {
          return String(t);
        }
      });

      const eventType = parseEventType(topicStrings);
      if (!eventType) continue;

      let eventData: any = {};
      if (event.value) {
        try {
          eventData =
            typeof event.value === "string"
              ? JSON.parse(event.value)
              : event.value;
        } catch {
          eventData = { raw: String(event.value) };
        }
      }

      const agreementId = extractAgreementId(eventData);
      const milestoneIndex = extractMilestoneIndex(eventData);
      const txHash = event.id ?? null;
      const ledger = Number(event.pagingToken?.split("-")[0] ?? 0);

      try {
        await pool.query(
          `INSERT INTO events (event_type, agreement_id, milestone_index, payload, ledger, tx_hash)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (tx_hash, event_type, agreement_id, milestone_index) DO NOTHING`,
          [
            eventType,
            agreementId,
            milestoneIndex,
            JSON.stringify(eventData),
            ledger,
            txHash,
          ],
        );
      } catch (err: any) {
        if (err.code === "23505") continue;
        throw err;
      }

      await updateStatus(eventType, agreementId, milestoneIndex);
      await fireWebhooks(eventType, eventData);

      console.log(
        `[Indexer] Processed ${eventType} — agreement=${agreementId} milestone=${milestoneIndex}`,
      );

      lastCursor = event.pagingToken ?? lastCursor;
    }
  } catch (err: any) {
    console.error("[Indexer] Error polling events:", err.message);
  }
}

async function main(): Promise<void> {
  console.log("[Indexer] Starting event indexer...");
  console.log(`[Indexer] Contract: ${CONTRACT_ID}`);
  console.log(`[Indexer] RPC: ${RPC_URL}`);

  await loadCursor();
  console.log(`[Indexer] Starting from cursor: ${lastCursor ?? "latest"}`);

  const poll = async () => {
    await processEvents();
    setTimeout(poll, POLL_INTERVAL_MS);
  };

  poll();
}

main().catch(console.error);
