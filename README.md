# FlowLock Protocol

Programmable escrow on Stellar/Soroban. Milestone-based payments with automatic deadline enforcement, split payments, and Soroswap DEX integration.

---

## Architecture

```
Freighter Wallet
      │
      ▼
Next.js Frontend  ──────────────────────────────────────────►  Soroban Contract
      │                                                          (FlowLockEscrow)
      │  REST API                                                      │
      ▼                                                                │ events
Express Backend (Railway)  ◄──  Indexer (local)  ◄────────────────────┘
      │                              │
      ▼                              ▼
PostgreSQL (Supabase)         Keeper (local)
                               │
                               └──► execute_due (auto-release / refund on deadline)
```

**Flow:**
`create_agreement` → `fund_with_settlement_asset` → `submit_work` → `approve_release` (or keeper `execute_due`)

---

## Smart Contract (already deployed on Testnet)

| | |
|---|---|
| **Contract ID** | `CB4VDJ5NYOQLTNCWOLKA3IR7NRFDUXVRAAWVW6GG7KABEOENFOHY3ETV` |
| **Network** | Stellar Testnet |
| **RPC** | `https://soroban-testnet.stellar.org` |

### Public functions

| Function | Who calls it | Description |
|---|---|---|
| `create_agreement(payer, provider, settlement_asset, platform, milestones)` | Payer | Creates escrow with N milestones |
| `fund_with_settlement_asset(agreement_id, milestone_id, amount)` | Payer | Locks `milestone.amount` in escrow |
| `submit_work(agreement_id, milestone_id, metadata_hash)` | Provider | Marks milestone Submitted with evidence hash |
| `approve_release(agreement_id, milestone_id)` | Payer | Releases payment to splits |
| `execute_due(agreement_id, milestone_id, caller)` | Keeper | Auto-refunds (Funded+expired) or auto-releases (Submitted+expired) |
| `cancel_unfunded(agreement_id, caller)` | Payer | Cancels agreement if all milestones still Draft |

### Testnet Token Addresses

| Token | Contract ID |
|---|---|
| XLM (native wrapped) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| USDC | `CBBHRKEP5M3NUDRISGLJKGHDHX3DA2CN2AZBQY6WLVUJ7VNLGSKBDUCM` |

### Milestone lifecycle

```
Draft → Funded → Submitted → Released
                           ↘ Refunded  (keeper, delivery deadline expired)
                Draft → Cancelled      (payer, all milestones still Draft)
```

---

## Stack

| Layer | Technology |
|---|---|
| Smart contract | Rust / Soroban |
| Backend API | Node.js + Express + TypeScript |
| Database | PostgreSQL (Supabase) |
| Frontend | Next.js 14 App Router + Tailwind CSS |
| Indexer | Node.js event poller (runs locally) |
| Keeper | Node.js cron worker (runs locally) |
| Wallet | Freighter browser extension |

---

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9 — `npm install -g pnpm`
- **Freighter** wallet extension — configure to **Testnet** and fund with test XLM via [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test)
- A **Supabase** project (free tier works)
- A **Railway** account for backend deploy (free tier works)

> The Soroban contract is already deployed on Testnet — no Rust toolchain needed to run the app.

---

## Repository Structure

```
FlowLock/
  contracts/flowlock-escrow/   # Soroban smart contract (Rust)
  backend/                     # Express API server
  frontend/                    # Next.js demo UI
  indexer/                     # Event poller (runs locally)
  keeper/                      # Deadline executor (runs locally)
```

---

## 1. Database — Supabase

### Create the tables

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run the migration:

```bash
# From the project root (requires DATABASE_URL set):
cd backend
npm install
npx ts-node src/migrate.ts
```

Or paste the contents of `backend/src/migrate.ts` directly into the Supabase SQL editor.

### Get your connection string

Settings → Database → Connection string (URI mode):
```
postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

> Enable **IPv6 output** in Railway (Settings → Networking) if connecting from Railway — Supabase uses IPv6 by default.

---

## 2. Backend — Railway

### Environment variables (set in Railway dashboard)

```env
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
NODE_ENV=production
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
SOROSWAP_API_URL=https://api.soroswap.finance
PORT=3000
```

### Deploy

1. Connect your GitHub repo to Railway
2. Set root directory to `backend/`
3. The included `backend/railway.toml` configures Nixpacks builder automatically
4. Railway will build with `npm install --include=dev && node node_modules/typescript/bin/tsc` and start with `node dist/index.js`

### Verify

```bash
curl https://<your-railway-url>/api/health
# → {"status":"ok","timestamp":"..."}
```

### Register your API key

```bash
curl -X POST https://<your-railway-url>/api/integrators/register \
  -H "Content-Type: application/json" \
  -d '{"name":"flowlock-frontend","platform_address":"GDCVFCADQFJ4VBPROR5XQX5G3UUKQ5TTWF3S7E6X7XUMIGS2P6HE2M5B"}'
# → {"id":1,"name":"flowlock-frontend","api_key":"flk_..."}
```

Save the `api_key` — you'll need it for the frontend.

### Run locally (optional)

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL
pnpm install
pnpm dev
# Listening on http://localhost:3001
```

---

## 3. Frontend — Vercel

### Environment variables (set in Vercel dashboard)

```env
NEXT_PUBLIC_CONTRACT_ID=CB4VDJ5NYOQLTNCWOLKA3IR7NRFDUXVRAAWVW6GG7KABEOENFOHY3ETV
NEXT_PUBLIC_XLM_CONTRACT_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
NEXT_PUBLIC_USDC_CONTRACT_ID=CBBHRKEP5M3NUDRISGLJKGHDHX3DA2CN2AZBQY6WLVUJ7VNLGSKBDUCM
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_BACKEND_URL=https://<your-railway-url>
NEXT_PUBLIC_API_KEY=flk_<your-api-key>
```

### Deploy

1. Connect your GitHub repo to Vercel
2. Set root directory to `frontend/`
3. Framework preset: **Next.js**
4. Add the environment variables above
5. Deploy

### Run locally

```bash
cd frontend
cp .env.local.example .env.local   # fill in variables
pnpm install
pnpm dev
# → http://localhost:3000
```

---

## 4. Indexer — run locally

The indexer polls Stellar RPC every 7 seconds for contract events and updates the database (milestone/agreement status, events feed).

### Setup

```bash
cd indexer
```

Create `.env`:
```env
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
FLOWLOCK_CONTRACT_ID=CB4VDJ5NYOQLTNCWOLKA3IR7NRFDUXVRAAWVW6GG7KABEOENFOHY3ETV
```

### Run

```bash
pnpm install
pnpm dev
```

Expected output:
```
[Indexer] Starting event indexer...
[Indexer] Contract: CB4VDJ5NYOQLTNCWOLKA3IR7NRFDUXVRAAWVW6GG7KABEOENFOHY3ETV
[Indexer] RPC: https://soroban-testnet.stellar.org
[Indexer] Starting from cursor: latest
[Indexer] Processed MilestoneFunded — agreement=X milestone=0
```

### Event → Status mapping

| Contract event | Table | New status |
|---|---|---|
| `MilestoneFunded` | milestones | `Funded` |
| `WorkSubmitted` | milestones | `Submitted` |
| `SplitPaid` | milestones | `Released` |
| `AutoReleased` | milestones | `Released` |
| `RefundExecuted` | milestones | `Refunded` |
| `AgreementCancelled` | agreements | `Cancelled` |

---

## 5. Keeper — run locally

The keeper checks every 30 seconds for milestones with expired deadlines and calls `execute_due` automatically.

### Setup

```bash
cd keeper
```

Create `.env`:
```env
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
FLOWLOCK_CONTRACT_ID=CB4VDJ5NYOQLTNCWOLKA3IR7NRFDUXVRAAWVW6GG7KABEOENFOHY3ETV
KEEPER_SECRET_KEY=S<your-keeper-account-secret-key>
```

> Generate a keeper account at [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test) — needs a small XLM balance for transaction fees.

### Run

```bash
pnpm install
pnpm dev
```

Expected output:
```
[Keeper] Starting keeper bot...
[Keeper] Contract: CB4...
[Keeper] Poll interval: 30000ms
```

---

## Happy Path — End-to-End

You need **two Freighter accounts** funded with testnet XLM (payer + provider).

### 1. Create Agreement (Payer)

1. Connect **payer account** in Freighter (set to Testnet)
2. Go to **New Agreement** (`/agreements/new`)
3. Fill in provider address, milestone amount, deadlines, payment splits
4. Click **Create Agreement** → sign in Freighter
5. Note the **On-chain ID** shown on success screen

### 2. Fund Milestone (Payer)

1. Go to **Payer Panel** (`/payer?agreement=<id>`)
2. Click **Fund** on the milestone → sign in Freighter
3. Indexer updates milestone to `Funded` within ~7 seconds → refresh

### 3. Submit Work (Provider)

1. Switch Freighter to **provider account**, reconnect wallet
2. Go to **Provider Panel** (`/provider`)
3. Load the agreement by ID
4. Enter work description → click **Submit Work** → sign in Freighter
5. Indexer updates milestone to `Submitted` within ~7 seconds → refresh

### 4. Approve Release (Payer)

1. Switch back to **payer account**, reconnect wallet
2. Go to **Payer Panel** (`/payer?agreement=<id>`)
3. Click **Approve Release** → sign in Freighter
4. Indexer updates milestone to `Released` → payment distributed to splits

---

## API Reference

All endpoints require `X-API-Key: flk_<your-key>` header (except health and GET endpoints).

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/agreements` | Create agreement record |
| GET | `/api/agreements` | List agreements (filter by `payer`, `provider`) |
| GET | `/api/agreements/:id` | Get agreement (resolves by DB id OR on_chain_id) |
| GET | `/api/agreements/:id/milestones` | List milestones for agreement |
| GET | `/api/agreements/:id/milestones/:mid` | Get milestone + events |
| GET | `/api/events` | List contract events |
| GET | `/api/keeper/status` | Keeper stats |
| GET | `/api/keeper/due` | Milestones due for execution |
| GET | `/api/keeper/runs` | Keeper run history |
| POST | `/api/soroswap/quote` | Proxy Soroswap quote |
| POST | `/api/integrators/register` | Register and get API key |
| POST | `/api/webhooks/register` | Register webhook subscription |

---

## Notes for Judges

- **Indexer and Keeper run locally** — they connect to the same Supabase database as Railway. In a production setup these would be deployed as separate services or cron jobs.
- **Soroswap** returns 403 on Testnet for XLM pairs — the UI shows a fallback banner and the user funds directly with the settlement asset.
- **Freighter** must be set to **Testnet** mode before connecting.
- All on-chain state is authoritative — the backend/DB is a read mirror updated by the indexer.

---

## License

MIT
