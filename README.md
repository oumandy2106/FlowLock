# FlowLock Protocol

Programmable settlement protocol built on Stellar/Soroban. Escrow with milestone-based releases, automatic keeper execution, split payments, and Soroswap integration.

## Architecture

```
Wallet (Freighter) -> Soroswap (XLM->USDC) -> Soroban Escrow (fund) -> submit_work -> Keeper (execute_due) -> Split -> Events -> Integrator
```

## Stack

- **Smart Contract**: Rust / Soroban (Stellar)
- **SDK**: TypeScript (`@flowlock/sdk`)
- **Backend**: Node.js / Express
- **Frontend**: React / Next.js / Tailwind
- **Keeper**: Node.js cron worker
- **Indexer**: Node.js event poller

## Monorepo Structure

```
flowlock/
  contracts/flowlock-escrow/   # Soroban smart contract (Rust)
  sdk/                         # TypeScript SDK
  backend/                     # API server
  frontend/                    # Demo UI
  keeper/                      # Deadline executor
  indexer/                     # Event indexer
  docs/                        # Documentation
```

## Prerequisites

- Rust >= 1.84 (`rustup` from https://rustup.rs)
- `wasm32v1-none` target: `rustup target add wasm32v1-none`
- Stellar CLI >= 26: `cargo install stellar-cli`
- Node.js >= 20
- pnpm >= 9: `npm install -g pnpm`
- Freighter wallet extension (for frontend)

## Setup

```bash
# 1. Clone and install
git clone <repo-url> && cd flowlock
pnpm install

# 2. Generate testnet accounts
stellar keys generate alice --network testnet --fund
stellar keys generate bob --network testnet --fund
stellar keys generate platform --network testnet --fund
stellar keys generate keeper-bot --network testnet --fund

# 3. Build the contract
stellar contract build

# 4. Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32v1-none/release/flowlock_escrow.wasm \
  --source-account alice \
  --network testnet \
  --alias flowlock-escrow

# 5. Copy .env
cp .env.example .env
# Fill in FLOWLOCK_CONTRACT_ID from deploy output

# 6. Build SDK
pnpm build:sdk
```

## Running Tests

```bash
# Contract tests
cargo test

# SDK build check
cd sdk && pnpm build
```

## Contract ID (Testnet)

> Deploy and update here: `FLOWLOCK_CONTRACT_ID=C...`

## Testnet Token Addresses

| Token | Contract ID |
|-------|------------|
| XLM   | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| USDC  | `CBBHRKEP5M3NUDRISGLJKGHDHX3DA2CN2AZBQY6WLVUJ7VNLGSKBDUCM` |

## License

MIT
