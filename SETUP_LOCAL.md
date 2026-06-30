# FlowLock — Levantar Indexer y Keeper localmente

El frontend y el backend ya están desplegados. Solo necesitas correr el **indexer** y el **keeper** en tu máquina para que el estado de los acuerdos se actualice en tiempo real y los deadlines se ejecuten automáticamente.

---

## Requisitos

- **Node.js** >= 20 → [nodejs.org](https://nodejs.org)
- **pnpm** >= 9

```bash
npm install -g pnpm
```

---

## 1. Clonar el repositorio

```bash
git clone <url-del-repo>
cd FlowLock
```

---

## 2. Colocar los archivos `.env`

Se te adjuntarán dos archivos `.env` ya configurados. Colócalos así:

```
FlowLock/
  indexer/
    .env        ← aquí el .env del indexer
  keeper/
    .env        ← aquí el .env del keeper
```

---

## 3. Instalar dependencias

```bash
cd indexer && pnpm install
cd ../keeper && pnpm install
```

---

## 4. Correr el Indexer

Abre una terminal y ejecuta:

```bash
cd indexer
pnpm dev
```

Salida esperada:
```
[Indexer] Starting event indexer...
[Indexer] Contract: CB4VDJ5NYOQLTNCWOLKA3IR7NRFDUXVRAAWVW6GG7KABEOENFOHY3ETV
[Indexer] RPC: https://soroban-testnet.stellar.org
[Indexer] Starting from cursor: latest
```

Cuando ocurra un evento on-chain verás líneas como:
```
[Indexer] Processed MilestoneFunded — agreement=3 milestone=0
[Indexer] Processed WorkSubmitted — agreement=3 milestone=0
[Indexer] Processed SplitPaid — agreement=3 milestone=0
```

> El indexer debe quedarse corriendo. Actualiza el estado de los milestones en la base de datos cada ~7 segundos.

---

## 5. Correr el Keeper

Abre **otra terminal** y ejecuta:

```bash
cd keeper
pnpm dev
```

Salida esperada:
```
[Keeper] Starting keeper bot...
[Keeper] Contract: CB4VDJ5NYOQLTNCWOLKA3IR7NRFDUXVRAAWVW6GG7KABEOENFOHY3ETV
[Keeper] Poll interval: 30000ms
```

Cuando haya un milestone con deadline vencido verás:
```
[Keeper] Found 1 candidate(s) to process
[Keeper] auto-release executed — agreement=3 milestone=0 tx=abc123...
```

> El keeper debe quedarse corriendo. Revisa cada 30 segundos si hay milestones con deadlines vencidos y ejecuta `execute_due` automáticamente.

---

## Resumen

Necesitas **dos terminales abiertas** mientras pruebas:

| Terminal | Comando | Rol |
|---|---|---|
| 1 | `cd indexer && pnpm dev` | Escucha eventos del contrato y actualiza el DB |
| 2 | `cd keeper && pnpm dev` | Ejecuta deadlines vencidos automáticamente |

El frontend en Vercel ya apunta al backend en Railway y a la misma base de datos — no necesitas configurar nada más.
