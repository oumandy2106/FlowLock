# FlowLock Protocol — Progreso del Proyecto

## Estado General

| Etapa | Estado | Completado |
|-------|--------|------------|
| Stage 1 — On-chain + SDK | Completado | 100% |
| Stage 2 — Backend / Indexer / Keeper | Completado | 100% |
| Stage 3 — Frontend / Deploy / Demo | Pendiente | 0% |

---

## Stage 1 — Infraestructura On-Chain + SDK

### Smart Contract (Soroban/Rust)

- **Contrato:** `FlowLockEscrow`
- **Contract ID (Testnet):** `CB4VDJ5NYOQLTNCWOLKA3IR7NRFDUXVRAAWVW6GG7KABEOENFOHY3ETV`
- **Archivos:**
  - `contracts/flowlock-escrow/src/lib.rs` — Contrato principal (8 funciones públicas + 2 de lectura)
  - `contracts/flowlock-escrow/src/types.rs` — Tipos: Agreement, Milestone, Split, DataKey, enums de estado
  - `contracts/flowlock-escrow/src/errors.rs` — 14 errores tipados (`FlowLockError`)
  - `contracts/flowlock-escrow/src/events.rs` — 10 tipos de eventos con wrappers `#[contracttype]`
  - `contracts/flowlock-escrow/src/test.rs` — 23 tests unitarios

#### Funciones del contrato

| Función | Descripción | Probado On-Chain |
|---------|-------------|------------------|
| `create_agreement` | Crea un acuerdo con milestones, splits y deadlines | Si |
| `fund_with_settlement_asset` | Payer fondea un milestone con el asset de liquidación | Si |
| `submit_work` | Provider envía trabajo con metadata hash | Si |
| `approve_release` | Payer aprueba y libera los fondos (splits) | Si |
| `execute_due` | Keeper ejecuta auto-release o refund pasado el deadline | Si |
| `request_dispute` | Payer abre una disputa en un milestone | Si (tests) |
| `resolve_by_mutual_agreement` | Resolución mutua de disputa con splits personalizados | Si (tests) |
| `cancel_unfunded` | Cancela un agreement sin milestones fondeados | Si (tests) |
| `get_agreement` | Lectura de un agreement | Si |
| `get_milestone` | Lectura de un milestone | Si |

#### Tests unitarios (23/23 pasando)

```
test test::test_happy_path ... ok
test test::test_auto_release_after_review_deadline ... ok
test test::test_auto_refund_after_delivery_deadline ... ok
test test::test_dispute_and_mutual_resolution ... ok
test test::test_cancel_unfunded_agreement ... ok
test test::test_only_payer_can_fund ... ok
test test::test_only_provider_can_submit ... ok
test test::test_only_payer_can_approve ... ok
test test::test_cannot_fund_wrong_amount ... ok
test test::test_cannot_submit_before_funding ... ok
test test::test_cannot_approve_before_submission ... ok
test test::test_cannot_execute_due_before_deadline ... ok
test test::test_payer_cannot_equal_provider ... ok
test test::test_too_many_milestones ... ok
test test::test_invalid_split_total ... ok
test test::test_zero_amount ... ok
test test::test_deadline_order_validation ... ok
test test::test_too_many_recipients ... ok
test test::test_multiple_milestones ... ok
test test::test_keeper_bounty_distribution ... ok
test test::test_split_rounding ... ok
test test::test_nonce_increments ... ok
test test::test_cannot_double_fund ... ok
```

### SDK TypeScript (`@flowlock/sdk`)

- **Archivos:**
  - `sdk/src/client.ts` — Clase `FlowLock` con 10 métodos que mapean a funciones del contrato
  - `sdk/src/wallet.ts` — `WalletSigner`, `createNodeSigner()`, `getNetworkPassphrase()`
  - `sdk/src/soroswap.ts` — `SoroswapClient` para cotizaciones y swaps via Soroswap DEX
  - `sdk/src/types.ts` — Interfaces TypeScript para todos los tipos
  - `sdk/src/index.ts` — Re-exports

- **Dependencias:** `@stellar/stellar-sdk ^13.0.0`
- **Compila:** Sin errores

---

## Stage 2 — Backend / Indexer / Keeper

### Backend (Express API)

- **Puerto:** 3001
- **Archivo principal:** `backend/src/index.ts`
- **Endpoints probados:**

| Endpoint | Método | Auth | Estado |
|----------|--------|------|--------|
| `/api/health` | GET | No | Funciona |
| `/api/integrators/register` | POST | No | Funciona |
| `/api/agreements` | POST | API Key | Funciona |
| `/api/agreements/:id` | GET | Opcional | Funciona |
| `/api/agreements/:id/milestones` | GET | Opcional | Funciona |
| `/api/agreements/:id/milestones/:mid` | GET | Opcional | Funciona |
| `/api/events` | GET | API Key | Funciona |
| `/api/webhooks/register` | POST | API Key | Funciona |
| `/api/webhooks/:id` | DELETE | API Key | Funciona |
| `/api/keeper/status` | GET | No | Funciona |
| `/api/soroswap/quote` | POST | No | Funciona (Soroswap API da 403 en testnet) |

- **Componentes:**
  - `backend/src/auth.ts` — Middleware de autenticación con API Key (SHA-256 hash)
  - `backend/src/db.ts` — Pool de PostgreSQL
  - `backend/src/validation.ts` — Schemas Zod para validación
  - `backend/src/routes.ts` — Todas las rutas
  - `backend/src/migrate.ts` — Migración de 7 tablas

#### Base de datos (PostgreSQL)

7 tablas creadas y verificadas:

| Tabla | Descripción |
|-------|-------------|
| `integrators` | Apps registradas con API keys |
| `agreements` | Agreements off-chain |
| `milestones` | Milestones con deadlines y bounties |
| `splits` | Distribución de pagos por milestone |
| `events` | Eventos indexados del contrato |
| `webhook_subscriptions` | Suscripciones a webhooks |
| `keeper_runs` | Log de ejecuciones del keeper |

### Indexer

- **Archivo:** `indexer/src/index.ts`
- **Función:** Polls Soroban RPC cada 7s buscando eventos del contrato
- **Eventos que parsea:** AgreementCreated, MilestoneFunded, WorkSubmitted, AutoReleased, RefundExecuted, DisputeOpened, MutualResolutionReached, SplitPaid, KeeperPaid, AgreementCancelled
- **Features:** Deduplicación por `(tx_hash, event_type, agreement_id, milestone_index)`, webhooks con HMAC-SHA256, retries con backoff exponencial
- **Compila:** Sin errores

### Keeper Bot

- **Archivo:** `keeper/src/index.ts`
- **Función:** Polls la DB cada 30s buscando milestones pasados de deadline
- **Lógica:**
  - Milestone `Funded` + `delivery_deadline` pasado → ejecuta refund
  - Milestone `Submitted` + `review_deadline` pasado → ejecuta auto-release
- **Features:** 3 retries con backoff, logging a `keeper_runs`, skip de errores no-retryables
- **Compila:** Sin errores

---

## Pruebas E2E en Testnet

Se ejecutaron 2 flujos completos end-to-end directamente en Stellar Testnet:

### Flujo 1 — Aprobación Manual (Agreement #0)

| Paso | Operación | Resultado | Tx Hash |
|------|-----------|-----------|---------|
| 1 | `create_agreement` (alice como payer) | Agreement #0 creado, status: Active | `29cc3c...` |
| 2 | `fund_with_settlement_asset` (10M stroops XLM) | Milestone fondeado | `811cbf...` |
| 3 | `submit_work` (bob como provider) | Work submitted con metadata hash | `732e56...` |
| 4 | `approve_release` (alice aprueba) | Fondos liberados via splits | `8cab29...` |

**Pagos verificados:**
- Bob (provider, 90%): 8,910,000 stroops
- Platform (10%): 990,000 stroops
- Sin keeper bounty (aprobación manual)

### Flujo 2 — Auto-Release por Keeper (Agreement #2)

| Paso | Operación | Resultado | Tx Hash |
|------|-----------|-----------|---------|
| 1 | `create_agreement` (deadlines 5min/6min) | Agreement #2 creado | `df1455...` |
| 2 | `fund_with_settlement_asset` (5M stroops XLM) | Milestone fondeado | `54ca67...` |
| 3 | `submit_work` (bob) | Work submitted | `cea0b2...` |
| 4 | *Espera de ~4 minutos* | Review deadline expira | — |
| 5 | `execute_due` (keeper-bot) | Auto-release + bounty pagado | `cdc19a...` |

**Pagos verificados:**
- Keeper-bot (bounty): 50,000 stroops
- Bob (provider, 95%): 4,702,500 stroops
- Platform (5%): 247,500 stroops
- Evento `AutoReleased` emitido correctamente

### Cuentas de Testnet usadas

| Alias | Address | Rol |
|-------|---------|-----|
| alice | `GA6QLBLEERSGQ4GS6COOHSMNMZR5GMCVLR24P6HM23XAV4L5BZIJCOSO` | Payer |
| bob | `GBITZNKREN5YR5PJKWIPJ3F7Y7TRESQTI5OGRPPNG4CNARVUNXMDRBXD` | Provider |
| platform | `GDCVFCADQFJ4VBPROR5XQX5G3UUKQ5TTWF3S7E6X7XUMIGS2P6HE2M5B` | Platform fee |
| keeper-bot | `GBYFK2ZUSX5567JNO7XUGOMQLNFH3D4TS6HS6GBWMRSHF2DVPO5LOPQ3` | Keeper |

### Assets

| Asset | Contract ID |
|-------|-------------|
| XLM (native) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| USDC (testnet) | `CBBHRKEP5M3NUDRISGLJKGHDHX3DA2CN2AZBQY6WLVUJ7VNLGSKBDUCM` |

---

## Notas y Contingencias

- **Soroswap API:** Retorna 403 en testnet — contingencia documentada, el fallback es fondeo directo con el settlement asset (que es lo que se probó)
- **PowerShell timestamps:** `Get-Date -UFormat %s` no usa UTC, causó errores de `InvalidDeadline`. Se resolvió usando `date +%s` desde Git Bash
- **Stellar CLI:** Requiere `--network-passphrase "Test SDF Network ; September 2015"` además de `--network testnet`
- **JSON en PowerShell:** Las comillas se pierden. Solución: usar `--milestones-file-path` con archivo JSON

---

## Pendiente — Stage 3

- [ ] Frontend (Next.js/React) con UI para crear agreements, fondear, submit work
- [ ] Integración con Freighter wallet
- [ ] Dashboard de agreements y milestones
- [ ] Deploy de servicios
- [ ] Video demo para hackathon
