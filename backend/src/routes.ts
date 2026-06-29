import { Router, type Router as RouterType } from "express";
import { randomBytes, createHash } from "crypto";
import pool from "./db.js";
import { apiKeyAuth, optionalApiKeyAuth, hashApiKey } from "./auth.js";
import {
  createAgreementSchema,
  webhookRegisterSchema,
  soroswapQuoteSchema,
} from "./validation.js";

const router: RouterType = Router();

// --- Health ---

router.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Agreements ---

router.post("/api/agreements", apiKeyAuth, async (req, res) => {
  const parsed = createAgreementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const data = parsed.data;

  for (const m of data.milestones) {
    const totalBps = m.splits.reduce((sum, s) => sum + s.bps, 0);
    if (totalBps !== 10000) {
      res
        .status(400)
        .json({ error: `Splits must sum to 10000 bps, got ${totalBps}` });
      return;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const agResult = await client.query(
      `INSERT INTO agreements (payer, provider, settlement_asset, platform, milestone_count, status)
       VALUES ($1, $2, $3, $4, $5, 'Draft')
       RETURNING id`,
      [
        data.payer,
        data.provider,
        data.settlement_asset,
        data.platform ?? null,
        data.milestones.length,
      ],
    );
    const agreementId = agResult.rows[0].id;

    for (let i = 0; i < data.milestones.length; i++) {
      const m = data.milestones[i];
      const mResult = await client.query(
        `INSERT INTO milestones (agreement_id, milestone_index, amount, delivery_deadline, review_deadline, keeper_bounty, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'Draft')
         RETURNING id`,
        [
          agreementId,
          i,
          m.amount,
          m.delivery_deadline,
          m.review_deadline,
          m.keeper_bounty,
        ],
      );
      const milestoneId = mResult.rows[0].id;

      for (const s of m.splits) {
        await client.query(
          `INSERT INTO splits (milestone_id, recipient, bps) VALUES ($1, $2, $3)`,
          [milestoneId, s.recipient, s.bps],
        );
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ id: agreementId });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.get("/api/agreements", optionalApiKeyAuth, async (req, res) => {
  const { limit = "20", offset = "0", payer, provider } = req.query;
  let query = "SELECT * FROM agreements WHERE 1=1";
  const params: any[] = [];
  let idx = 1;
  if (payer)    { query += ` AND payer = $${idx++}`;    params.push(payer); }
  if (provider) { query += ` AND provider = $${idx++}`; params.push(provider); }
  query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(Number(limit), Number(offset));
  const result = await pool.query(query, params);
  res.json(result.rows);
});

router.get("/api/agreements/:id", optionalApiKeyAuth, async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    "SELECT * FROM agreements WHERE id = $1 OR on_chain_id = $1",
    [id],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: "Agreement not found" });
    return;
  }
  res.json(result.rows[0]);
});

router.get(
  "/api/agreements/:id/milestones",
  optionalApiKeyAuth,
  async (req, res) => {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT m.*, json_agg(json_build_object('recipient', s.recipient, 'bps', s.bps)) AS splits
       FROM milestones m
       LEFT JOIN splits s ON s.milestone_id = m.id
       WHERE m.agreement_id = $1
       GROUP BY m.id
       ORDER BY m.milestone_index`,
      [id],
    );
    res.json(result.rows);
  },
);

router.get(
  "/api/agreements/:id/milestones/:mid",
  optionalApiKeyAuth,
  async (req, res) => {
    const { id, mid } = req.params;
    const mResult = await pool.query(
      `SELECT m.*, json_agg(json_build_object('recipient', s.recipient, 'bps', s.bps)) AS splits
       FROM milestones m
       LEFT JOIN splits s ON s.milestone_id = m.id
       WHERE m.agreement_id = $1 AND m.milestone_index = $2
       GROUP BY m.id`,
      [id, mid],
    );
    if (mResult.rows.length === 0) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }

    const events = await pool.query(
      `SELECT * FROM events WHERE agreement_id = $1 AND milestone_index = $2 ORDER BY created_at`,
      [id, mid],
    );

    res.json({ ...mResult.rows[0], events: events.rows });
  },
);

// --- Events ---

router.get("/api/events", apiKeyAuth, async (req, res) => {
  const {
    event_type,
    agreement_id,
    from,
    to,
    limit = "50",
    offset = "0",
  } = req.query;

  let query = "SELECT * FROM events WHERE 1=1";
  const params: any[] = [];
  let idx = 1;

  if (event_type) {
    query += ` AND event_type = $${idx++}`;
    params.push(event_type);
  }
  if (agreement_id) {
    query += ` AND agreement_id = $${idx++}`;
    params.push(agreement_id);
  }
  if (from) {
    query += ` AND created_at >= $${idx++}`;
    params.push(from);
  }
  if (to) {
    query += ` AND created_at <= $${idx++}`;
    params.push(to);
  }

  query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(Number(limit), Number(offset));

  const result = await pool.query(query, params);
  res.json(result.rows);
});

// --- Webhooks ---

router.post("/api/webhooks/register", apiKeyAuth, async (req, res) => {
  const parsed = webhookRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const { url, secret, events_filter } = parsed.data;
  const secretHash = createHash("sha256").update(secret).digest("hex");
  const integratorId = (req as any).integrator.id;

  const result = await pool.query(
    `INSERT INTO webhook_subscriptions (integrator_id, url, secret_hash, events_filter)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [integratorId, url, secretHash, events_filter ?? null],
  );

  res.status(201).json({ id: result.rows[0].id });
});

router.delete("/api/webhooks/:id", apiKeyAuth, async (req, res) => {
  const integratorId = (req as any).integrator.id;
  const result = await pool.query(
    `DELETE FROM webhook_subscriptions WHERE id = $1 AND integrator_id = $2 RETURNING id`,
    [req.params.id, integratorId],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }

  res.json({ deleted: true });
});

// --- Keeper Status ---

router.get("/api/keeper/status", async (_req, res) => {
  const lastRun = await pool.query(
    "SELECT * FROM keeper_runs ORDER BY created_at DESC LIMIT 1",
  );
  const pending = await pool.query(
    `SELECT COUNT(*) as count FROM milestones
     WHERE (status = 'Funded' OR status = 'Submitted')`,
  );
  const bounties = await pool.query(
    "SELECT COALESCE(SUM(bounty_earned), 0) as total FROM keeper_runs WHERE status = 'success'",
  );

  res.json({
    last_run: lastRun.rows[0] ?? null,
    pending_milestones: Number(pending.rows[0].count),
    total_bounties: Number(bounties.rows[0].total),
  });
});

// --- Soroswap Proxy ---

router.post("/api/soroswap/quote", async (req, res) => {
  const parsed = soroswapQuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const { inputAsset, settlementAsset, amount } = parsed.data;
  const soroswapUrl =
    process.env.SOROSWAP_API_URL ?? "https://api.soroswap.finance";
  const network = process.env.STELLAR_NETWORK ?? "testnet";

  try {
    const quoteRes = await fetch(`${soroswapUrl}/quote?network=${network}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assetIn: inputAsset,
        assetOut: settlementAsset,
        amount,
        tradeType: "EXACT_IN",
        protocols: ["soroswap", "aqua"],
        slippageBps: 50,
      }),
    });

    if (!quoteRes.ok) {
      const text = await quoteRes.text();
      res.status(quoteRes.status).json({ error: text });
      return;
    }

    const quote = await quoteRes.json();
    res.json(quote);
  } catch (err: any) {
    res.status(502).json({ error: `Soroswap API error: ${err.message}` });
  }
});

// --- Keeper Due Milestones ---

router.get("/api/keeper/due", async (_req, res) => {
  const now = Math.floor(Date.now() / 1000);
  const result = await pool.query(
    `SELECT m.*, a.payer, a.provider, a.settlement_asset, a.on_chain_id AS agreement_on_chain_id,
            json_agg(json_build_object('recipient', s.recipient, 'bps', s.bps)) AS splits
     FROM milestones m
     JOIN agreements a ON a.id = m.agreement_id
     LEFT JOIN splits s ON s.milestone_id = m.id
     WHERE (m.status = 'Funded'    AND m.delivery_deadline < $1)
        OR (m.status = 'Submitted' AND m.review_deadline   < $1)
     GROUP BY m.id, a.payer, a.provider, a.settlement_asset, a.on_chain_id
     ORDER BY m.delivery_deadline ASC
     LIMIT 50`,
    [now],
  );
  res.json(result.rows);
});

// --- Keeper Runs Log ---

router.get("/api/keeper/runs", async (req, res) => {
  const { limit = "20", offset = "0" } = req.query;
  const result = await pool.query(
    `SELECT * FROM keeper_runs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [Number(limit), Number(offset)],
  );
  res.json(result.rows);
});

// --- Integrator Registration (bootstrap) ---

router.post("/api/integrators/register", async (req, res) => {
  const { name, platform_address } = req.body;
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const apiKey = `flk_${randomBytes(24).toString("hex")}`;
  const hash = hashApiKey(apiKey);

  const result = await pool.query(
    `INSERT INTO integrators (name, api_key_hash, platform_address)
     VALUES ($1, $2, $3)
     RETURNING id, name`,
    [name, hash, platform_address ?? null],
  );

  res.status(201).json({
    id: result.rows[0].id,
    name: result.rows[0].name,
    api_key: apiKey,
  });
});

export default router;
