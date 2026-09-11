# Nyrvok — System Architecture

## 1. System Overview

Nyrvok is a deterministic execution gateway connecting autonomous AI pathfinding frameworks (specifically Wayfinder AI) with reliable, non-custodial on-chain execution infrastructure provided by KeeperHub.

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
│  │ KeeperHub Turnkey Custody    │          │ Safe Refusal Log        │  │
│  │ (Non-custodial server signer)│          │ - Status: REFUSED       │  │
│  └──────────┬───────────────────┘          │ - Gas Burned: $0.00     │  │
│             │ Signed Tx                    │ - Halts Waypoint Loop   │  │
│             ▼                              └─────────────────────────┘  │
│  ┌──────────────────────────────┐                                       │
│  │ Private MEV-Shielded RPC     │                                       │
│  │ (Base Mainnet / Sepolia)     │                                       │
│  └──────────┬───────────────────┘                                       │
│             │ Confirmed Receipt                                         │
│             ▼                                                           │
│  ┌──────────────────────────────┐                                       │
│  │ ERC-8004 Reputation Logger   │                                       │
│  │ (Attestation to Registry)    │                                       │
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

### 2.1 Waypoint Ingestor (`src/lib/wayfinder/ingestor.ts`)
- Normalizes raw strategy outputs from Wayfinder Paths Python SDK into strongly typed `WaypointPathway` bundles.
- Decodes and validates target protocol contract calls (e.g. Aerodrome Router, Moonwell Comptroller, Uniswap V3 SwapRouter).
- Enforces strict parameter validation: maximum allowable slippage (default: 50 bps / 0.5%), deadline limits, and minimum output amounts.

### 2.2 KeeperHub Simulation Client (`src/lib/keeperhub/simulation.ts`)
- Calls KeeperHub `/api/execute/simulate` to execute the transaction bundle in a sandbox environment against current chain state.
- Inspects simulated return values, actual slippage, state diffs, and exact gas estimation.
- If simulation detects an invariant violation (e.g., price impact > limit, insufficient liquidity, contract paused), halts immediately with `SIMULATION_REFUSED` and calculates gas saved.

### 2.3 Turnkey Custody & Execution Gateway (`src/lib/keeperhub/executor.ts`)
- Replaces raw local mnemonics with KeeperHub managed Turnkey sub-wallets.
- Constructs signed transaction envelopes via KeeperHub's non-custodial signing session.
- Submits transactions through private RPC channels on Base to prevent public mempool sandwiching and front-running.
- Manages sequential nonce queues to ensure rapid multi-hop waypoints execute in exact chronological order without dropped nonces.

### 2.4 ERC-8004 Reputation Attestor (`src/lib/reputation/erc8004.ts`)
- Interacts with the ERC-8004 ReputationRegistry on Base.
- Upon receipt confirmation, calls `giveFeedback` to log an immutable proof tying the agent ID, execution ID, transaction hash, and execution latency.

### 2.5 Provider Seam (`src/lib/wayfinder/provider.ts`)
- Implements the interface `IWayfinderProvider`.
- Dual implementations:
  - `LiveWayfinderProvider`: Connects to Wayfinder API coordinator.
  - `FixtureWayfinderProvider`: Provides deterministic recorded pathway bundles from `wayfinder-paths-sdk` (Boros Hype strategy, Moonwell lending loop, Aerodrome rebalance) for reproducible local testing and offline judge walkthroughs.

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
}

export interface WaypointPathway {
  pathwayId: string;
  strategyId: string;
  network: "base-mainnet" | "base-sepolia";
  steps: WaypointStep[];
  totalValueUsd: number;
  timestamp: number;
}

export interface SimulationResult {
  simulationId: string;
  pathwayId: string;
  status: "passed" | "refused";
  estimatedGas: bigint;
  gasPriceGwei: number;
  simulatedOutput: string;
  actualSlippageBps: number;
  refusalReason?: string;
  gasSavedUsd: number;
  timestamp: number;
}

export interface ExecutionReceipt {
  executionId: string;
  pathwayId: string;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  status: "confirmed" | "failed";
  explorerUrl: string;
  erc8004Logged: boolean;
  timestamp: number;
}

export interface TelemetryStats {
  totalSimulations: number;
  passedCount: number;
  refusedCount: number;
  gasSavedTotalUsd: number;
  confirmedTxs: number;
  activeNetwork: string;
}
```

---

## 4. API Specification

### `POST /api/waypoint/ingest`
- **Description**: Ingests a strategy pathway from Wayfinder.
- **Payload**: `WaypointPathway`
- **Response**: `{ success: true, pathwayId: string, stepCount: number }`

### `POST /api/waypoint/simulate`
- **Description**: Runs KeeperHub pre-flight dry-run simulation on the pathway.
- **Payload**: `{ pathwayId: string, forceSlippageFail?: boolean }`
- **Response**: `SimulationResult`

### `POST /api/waypoint/execute`
- **Description**: Executes simulation-approved pathway via Turnkey managed signer.
- **Payload**: `{ pathwayId: string, simulationId: string }`
- **Response**: `ExecutionReceipt`

### `GET /api/waypoint/status/:id`
- **Description**: Queries live status, block confirmations, and ERC-8004 log.
- **Response**: `{ status: "pending" | "confirmed" | "refused", receipt?: ExecutionReceipt }`

### `GET /api/telemetry/stats`
- **Description**: Aggregated real-time metrics for the UI dashboard.
- **Response**: `TelemetryStats`

---

## 5. Architectural Decision Records (ADRs)

### ADR-01: Turnkey Non-Custodial Signer Integration
- **Context**: Wayfinder Paths stores mnemonics in plain text.
- **Decision**: Use KeeperHub Turnkey sub-organizations. Nyrvok never handles private keys in memory.
- **Consequences**: Host breach does not compromise funds; signatures are bounded by Turnkey policy engine.

### ADR-02: Non-Bypassable Pre-Flight Simulation Barrier
- **Context**: Autonomous agents execute bad trades when market state drifts.
- **Decision**: Every waypoint bundle must pass `/api/execute/simulate` before any broadcast call is enabled.
- **Consequences**: Zero gas wasted on transaction reverts.

### ADR-03: Provider Seam for Test Reproducibility
- **Context**: Wayfinder API keys or rate limits could hinder judges during testing.
- **Decision**: Build `FixtureWayfinderProvider` with real captured test vectors from `wayfinder-paths-sdk`.
- **Consequences**: Tests run in under 5 seconds locally without external credentials.
