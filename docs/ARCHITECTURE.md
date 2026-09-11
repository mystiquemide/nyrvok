# Nyrvok — System Architecture

## 1. System Overview

Nyrvok is a deterministic execution gateway connecting autonomous AI pathfinding frameworks (specifically Wayfinder AI) with managed-custody on-chain execution infrastructure provided by KeeperHub.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          WAYFINDER PATHS SDK                            │
│           (Strategy Graph, Multi-Hop Swaps, Lending Adapters)           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Intent Pathway (JSON / Calldata)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       NYRVOK WAYPOINT GATEWAY                           │
│  ┌──────────────────────┐                     ┌──────────────────────┐  │
│  │ Waypoint Ingestor    │                     │ Provider Seam        │  │
│  │ (Validation & Types) │                     │ (Live API / Fixtures)│  │
│  └──────────┬───────────┘                     └──────────┬───────────┘  │
│             │                                            │              │
│             ▼                                            ▼              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │              KEEPERHUB PRE-FLIGHT SIMULATION GATE                 │  │
│  │  - Dry-run against latest block state without broadcasting       │  │
│  │  - Verifies slippage tolerance, token allowances, gas ceiling    │  │
│  │  - Refuses unsafe routes cleanly with ZERO gas burned             │  │
│  └──────────┬────────────────────────────────────────────┬───────────┘  │
│             │ PASSED                                     │ REFUSED      │
│             ▼                                            ▼              │
│  ┌──────────────────────────────┐          ┌─────────────────────────┐  │
│  │ KeeperHub Managed Custody    │          │ Safe Refusal Log        │  │
│  │ (Turnkey policy-bounded)     │          │ - Status: REFUSED       │  │
│  └──────────┬───────────────────┘          │ - Gas Burned: $0.00     │  │
│             │ Signed Tx + Idempotency-Key  │ - Halts Waypoint Loop   │  │
│             ▼                              └─────────────────────────┘  │
│  ┌──────────────────────────────┐                                       │
│  │ KeeperHub-Managed Broadcast  │                                       │
│  │ (Base Mainnet / Sepolia)     │                                       │
│  └──────────┬───────────────────┘                                       │
│             │ Confirmed Receipt (Viem-verified on Base RPC)             │
│             ▼                                                           │
│  ┌──────────────────────────────┐                                       │
│  │ ERC-8004 Attestation Record  │                                       │
│  │ (RFC Base64 Data URI)        │                                       │
│  └──────────────────────────────┘                                       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Status, Proofs & Hashes
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      NYRVOK TELEMETRY CONSOLE                           │
│     (Next.js 16 HUD, Waypoint Graph, BaseScan Proofs, Gas Saved)        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Modules

### 2.1 Waypoint Ingestor (`src/app/api/waypoint/ingest/route.ts`)
- Normalizes raw strategy outputs from Wayfinder Paths SDK into strongly typed `WaypointPathway` bundles.
- Decodes and validates target protocol contract calls (e.g. Aerodrome Router, Moonwell Comptroller, Uniswap V3 SwapRouter).
- Enforces strict parameter validation: maximum allowable slippage (default: 50 bps / 0.5%), deadline limits, and minimum output amounts.

### 2.2 KeeperHub Simulation Client (`src/lib/keeperhub/simulation.ts`)
- Calls KeeperHub `/execute/contract-call` and `/execute/transfer` with `simulate: true` to dry-run the transaction bundle against current chain state.
- Inspects simulated return values, declared slippage tolerances, and exact gas estimation.
- If simulation detects an invariant violation (e.g., contract revert, declared slippage tolerance above the 1.0% gateway envelope, insufficient liquidity), halts immediately with a `refused` result and estimates gas saved.

### 2.3 KeeperHub Custody & Execution Gateway (`src/lib/keeperhub/executor.ts`)
- Replaces raw local mnemonics with KeeperHub managed custodial wallets.
- Delegates transaction signing and broadcast to KeeperHub's execution infrastructure, attaching a deterministic `Idempotency-Key` per step so retries reuse one broadcast.
- Submits transactions to Base and verifies receipts directly against Base RPC nodes using Viem.
- Statically guards against nonce desynchronization by halting the multi-hop sequence before broadcast upon any dry-run revert.

### 2.4 ERC-8004 Reputation Attestor (`src/lib/reputation/erc8004.ts`)
- Formulates deterministic ERC-8004 reputation feedback records.
- Upon receipt confirmation, encodes an attestation payload tying the agent address, pathway ID, execution ID, transaction hashes, and execution latency into an ERC-8004 compliant RFC Base64 Data URI.
- Attestations are emitted off-chain and declare the canonical Base Reputation Registry (`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`) as the standard they conform to. On-chain `giveFeedback` broadcast requires a registered agentId and is left to operators via `ERC8004_REGISTRY_ADDRESS`.

### 2.5 Provider Seam (`src/lib/wayfinder/provider.ts`)
- Implements the interface `IWayfinderProvider`.
- Dual implementations:
  - `WayfinderLiveCoordinatorProvider`: Selected when `WAYFINDER_API_BASE_URL` is configured. Queries the coordinator's REST API (`/strategies`, `/pathways/:id`, `/pathways/latest`) and falls back to fixtures if the coordinator is unreachable.
  - `WayfinderFixtureProvider`: Default when no coordinator URL is set. Serves deterministic recorded pathway bundles (Boros Hype strategy, Moonwell supply, Aerodrome swap, injected-failure stress test) for reproducible local testing and offline judge walkthroughs.

---

## 3. Data Models & Type Contracts

```typescript
export type ProtocolId = "aerodrome" | "moonwell" | "uniswap_v3" | "bridge_base";

export type ActionType = "swap" | "approve" | "supply" | "borrow" | "rebalance";

export interface WaypointStep {
  stepIndex: number;
  protocol: ProtocolId;
  action: ActionType;
  targetAddress: `0x${string}`;
  calldata: `0x${string}`;
  value: bigint;
  expectedOutput: string;
  maxSlippageBps: number;
  label: string;
  description: string;
  functionName?: string;
  functionArgs?: unknown[];
  abi?: unknown[];
  tokenAddress?: `0x${string}`;
  recipientAddress?: `0x${string}`;
  amount?: string;
}

export interface WaypointPathway {
  pathwayId: string;
  strategyId: string;
  network: "base-mainnet" | "base-sepolia";
  steps: WaypointStep[];
  totalValueUsd: number;
  timestamp: number;
  idempotencyKey?: string;
  metadata?: { source: string; coordinator: string; version: string };
}

export interface SimulationResult {
  simulationId: string;
  pathwayId: string;
  stepIndex?: number;
  status: "passed" | "refused";
  estimatedGas: bigint;
  gasPriceGwei: number;
  simulatedOutput: string;
  actualSlippageBps: number;
  simulatedSlippageBps?: number;
  refusalReason?: string;
  gasSavedUsd: number;
  timestamp: number;
  executionPayload?: { to: `0x${string}`; data: `0x${string}`; value: string; chainId: number };
  keeperHubRaw?: unknown;
}

export interface ExecutionReceipt {
  executionId: string;
  pathwayId: string;
  stepIndex?: number;
  protocol?: ProtocolId;
  transactionHash: `0x${string}` | null;
  blockNumber: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  status: "confirmed" | "failed";
  explorerUrl: string | null;
  erc8004Logged: boolean;
  erc8004Score?: number;
  failureReason?: string;
  timestamp: number;
}

export interface TelemetryStats {
  totalSimulations: number;
  passedCount: number;
  refusedCount: number;
  gasSavedTotalUsd: number;
  confirmedTxs: number;
  activeNetwork: string;
  walletAddress: `0x${string}`;
}
```

---

## 4. API Specification

### `GET /api/waypoint/ingest?strategyId=&network=`
- **Description**: Lists the strategy catalog and returns the active pathway (fixture or live coordinator).
- **Response**: `{ success: true, strategies: StrategyMeta[], activePathway: WaypointPathway }`

### `POST /api/waypoint/ingest`
- **Description**: Validates and normalizes a caller-supplied pathway bundle (max 32 steps; address, calldata, and value checks).
- **Payload**: `{ pathwayId: string, steps: WaypointStep[], network?, strategyId?, totalValueUsd?, metadata? }`
- **Response**: `{ success: true, message: string, pathway: WaypointPathway }`

### `POST /api/waypoint/simulate`
- **Description**: Runs the sequential KeeperHub pre-flight dry-run gate and records server-side provenance bound to the pathway content hash.
- **Payload**: `{ pathway: WaypointPathway }` or `{ strategyId: string, network?: string }`
- **Response**: `{ success: true, summary: PathwaySimulationSummary }`

### `POST /api/waypoint/execute`
- **Description**: Executes a pathway only when this server holds a matching, fresh (15-minute) simulation provenance record and the submitted pathway content hash equals the simulated hash. Client-supplied `simulationResults` are ignored. Set `NYRVOK_API_TOKEN` on deployed instances to require `Authorization: Bearer <token>`.
- **Payload**: `{ pathway: WaypointPathway, idempotencyKey?: string }`
- **Response**: `{ success: true, summary: PathwayExecutionSummary, feedback: ERC8004FeedbackRecord | null }`
- **Errors**: `401` unauthorized, `400 SIMULATION_REQUIRED` / `PATHWAY_MISMATCH` / `SAFETY_INVARIANT_VIOLATION`

### `GET /api/telemetry/stats`
- **Description**: Aggregated real-time metrics for the UI dashboard, including recent simulations, executions, and ERC-8004 reputation.
- **Response**: `{ success: true, telemetry: FullTelemetryPayload, keeperHub: { authenticated, user } }`

---

## 5. Architectural Decision Records (ADRs)

### ADR-01: KeeperHub Managed Custody Integration
- **Context**: Wayfinder Paths stores mnemonics in plain text.
- **Decision**: Use KeeperHub managed wallets (Turnkey-secured sub-organizations). Nyrvok never handles private keys in memory.
- **Consequences**: Host breach does not compromise keys; signing is bounded by the account's KeeperHub policy engine and spending caps.

### ADR-02: Non-Bypassable Pre-Flight Simulation Barrier
- **Context**: Autonomous agents execute bad trades when market state drifts.
- **Decision**: Every waypoint bundle must pass `POST /api/waypoint/simulate` on this server before `POST /api/waypoint/execute` will accept it. Provenance is bound to a SHA-256 hash of the pathway's executable content and expires after 15 minutes. Client-supplied simulation results are never trusted.
- **Consequences**: Zero gas wasted on transaction reverts; a forged or stale simulation proof cannot unlock execution.

### ADR-03: Provider Seam for Test Reproducibility
- **Context**: Wayfinder API keys or rate limits could hinder judges during testing.
- **Decision**: Build `WayfinderFixtureProvider` with real captured pathway vectors; select `WayfinderLiveCoordinatorProvider` when `WAYFINDER_API_BASE_URL` is set.
- **Consequences**: Tests run in under 5 seconds locally without external credentials; live coordinator mode is one env var away.
