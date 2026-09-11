# Nyrvok: Autonomous Waypoint Execution Gateway for Wayfinder AI

Nyrvok is an autonomous waypoint execution gateway that bridges Wayfinder AI multi-hop route planning with KeeperHub execution infrastructure on Base.

Wayfinder maps complex multi-hop routes across decentralized finance protocols like Aerodrome and Moonwell. When agents submit transactions directly to the mempool, unexpected slippage spikes, liquidity shifts, or sandwich attacks cause on-chain reverts, burning gas and desyncing agent nonces. 

Nyrvok acts as an execution firewall:
1. **Ingestion**: Ingests multi-hop DeFi pathway strategies mapped by Wayfinder AI.
2. **Pre-Flight Invariant Simulation**: Runs sequential dry-runs through KeeperHub (`simulate: true`). If any step would revert or breach slippage limits (over 1.0%), the circuit breaker halts execution with **$0.00 gas burned**.
3. **KeeperHub Custody Execution**: Routes approved transaction bundles to Base with managed KeeperHub custody, eliminating private key exposure.
4. **Viem L2 Confirmation**: Verifies block numbers and gas utilization directly against Base RPC nodes.
5. **ERC-8004 Reputation Feedback**: Generates deterministic ERC-8004 reputation attestations with latency, gas usage, and performance scores (0 - 100) encoded as self-verifying RFC Base64 Data URIs declaring the canonical Base Reputation Registry.

---

## DoraHacks Hackathon Submission

- **Hackathon**: KeeperHub - The Agent Economy Hackathon
- **Target Tracks**:
  - **Main Track ($4,000)**: Best Integration into a Live Project (Wayfinder AI multi-hop DeFi router on Base)
  - **Bounty Track ($1,000)**: Best KeeperHub Feature (Standalone Wayfinder Protocol Plugin and Upstream PR)
- **Live KeeperHub User**: `mide27145`
- **KeeperHub Custody Wallet**: [`0x05619d1a133623B322a8f366ea9594e4e586f26D`](https://sepolia.basescan.org/address/0x05619d1a133623B322a8f366ea9594e4e586f26D)
- **Target Networks**: Base Mainnet (8453), Base Sepolia (84532)

---

## On-Chain Verification Proofs

| Dimension | Value / Evidence | Status |
| :--- | :--- | :--- |
| **Live Base Sepolia Tx** | [`0x232b466f28e6363a149fb5ff5d347c9d3d812b9007f5e413d862eabb6bf5c878`](https://sepolia.basescan.org/tx/0x232b466f28e6363a149fb5ff5d347c9d3d812b9007f5e413d862eabb6bf5c878) | Confirmed (Block #46691697) |
| **Live Pipeline E2E Tx** | [`0xda4c421d433e27404b74c608b3f85cefe13d0dc28ebe4f747de3544007e5cb7d`](https://base-sepolia.blockscout.com/tx/0xda4c421d433e27404b74c608b3f85cefe13d0dc28ebe4f747de3544007e5cb7d) | Confirmed (Block #46695903) — full ingest → simulate → execute pipeline |
| **KeeperHub Managed Custody** | `0x05619d1a133623B322a8f366ea9594e4e586f26D` | Active on Base Sepolia |
| **Pre-Flight Invariant Simulation** | KeeperHub dry-run engine (`simulate: true`) | Verified across 4 strategies |
| **Zero-Gas Stand-Down** | 5% slippage stress test halted before broadcast | $0.00 gas burned on-chain |
| **ERC-8004 Reputation Score** | Score 100/100, Trust Score: 100.00% (10000 bps) | Off-chain RFC Base64 attestation emitted |

---

## System Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     Wayfinder AI Agent                      │
│            Autonomous Multi-Hop Route Discovery             │
└──────────────────────────────┬──────────────────────────────┘
                               │ Ingest Pathway
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       Nyrvok Gateway                        │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │  Pre-Flight Simulation Gateway (simulate: true)     │   │
│   │  - Evaluates contract calls & transfer dry-runs     │   │
│   │  - Enforces 1.0% maximum slippage envelope          │   │
│   │  - Circuit-breaker: halts on first failed step       │   │
│   └──────────────────────────┬──────────────────────────┘   │
│                              │                              │
│              [Passed]        ▼        [Refused]             │
│        ┌───────────────────────────┐  ┌─────────────────┐   │
│        │ Invariant Guard Approved  │  │ Stand-Down Card │   │
│        │ Safety Gate Cleared       │  │ $0.00 Gas Burned│   │
│        └─────────────┬─────────────┘  └─────────────────┘   │
└──────────────────────┼──────────────────────────────────────┘
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│     KeeperHub Execution     │ │   ERC-8004 Attestation      │
│  Turnkey Custody on Base    │ │  Off-Chain Data URI Record  │
│  Viem Receipt Confirmation  │ │  Latency, Gas, & Score Data │
└─────────────────────────────┘ └─────────────────────────────┘
```

---

## Upstream KeeperHub Feature Contribution (Bounty Track)

As part of the $1,000 Bounty Track, Nyrvok provides a standalone protocol connector packaged for merge into `KeeperHub/keeperhub`:

- **Plugin Source**: [`src/upstream/wayfinder-plugin.ts`](src/upstream/wayfinder-plugin.ts)
- **Plugin Unit Tests**: [`test/upstream-plugin.test.ts`](test/upstream-plugin.test.ts)
- **Pull Request Documentation**: [`docs/BOUNTY_PR.md`](docs/BOUNTY_PR.md)

### Exposed Actions
- `ingestPathway`: Validates and parses Wayfinder multi-hop strategy schemas.
- `simulateRoute`: Orchestrates sequential pre-flight simulation and calculates avoided gas losses.
- `executeBundle`: Gated execution engine requiring verified simulation proofs before mempool submission.
- `logReputation`: Constructs ERC-8004 metadata Data URIs and records telemetry.
- `getReputationStats`: Computes historical reliability and agent trust score basis points.

---

## Getting Started

### Prerequisites
- Node.js v20+ or v22+
- pnpm v9+ or v10+

### Installation
```bash
git clone https://github.com/mystiquemide/nyrvok.git
cd nyrvok
pnpm install
```

### Environment Configuration
Create a `.env.local` file at the root:
```env
KEEPERHUB_API_KEY=your_keeperhub_api_key
KEEPERHUB_BASE_URL=https://app.keeperhub.com/api
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

Optional settings (see `.env.example` for details):
- `WAYFINDER_API_BASE_URL`: point at a live Wayfinder coordinator. Without it, the app serves recorded pathway fixtures.
- `DEFAULT_NETWORK=base-sepolia`: recommended for demos. Strategies default to Base Mainnet, where `Execute` spends real custody funds.
- `NYRVOK_API_TOKEN`: bearer token required on `POST /api/waypoint/execute`. Set it on any deployed instance.

### Running Tests
Execute the complete test suite (42 tests across 7 test files):
```bash
pnpm test
```

### Running Live Verification Harness
Run the end-to-end verification harness against live KeeperHub endpoints and Base RPC:
```bash
pnpm verify
```

### Running the Web Dashboard
Start the local Next.js telemetry console:
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) to monitor live waypoints, trigger pre-flight dry-runs, run 5% slippage failure stress tests, and inspect confirmed BaseScan receipts.

---

## Execution Safety Model

- **Provenance-bound execution**: `POST /api/waypoint/execute` only accepts a pathway that this server dry-ran itself within the last 15 minutes, verified by a SHA-256 hash of the pathway's executable content. Client-supplied simulation results are ignored, so forged "passed" proofs cannot unlock execution.
- **Platform idempotency**: every step broadcasts with a deterministic KeeperHub `Idempotency-Key`, so retries across restarts reuse one broadcast instead of double-spending.
- **Managed custody**: signing happens inside KeeperHub (Turnkey-secured) and is bounded by the account's policy engine and spending caps. Nyrvok never holds private keys.
- **Access control**: set `NYRVOK_API_TOKEN` on any deployed instance so only authorized callers can trigger executions. The local dev flow is unaffected.

## Data Provenance

The dashboard defaults to `WayfinderFixtureProvider`, which serves recorded pathway vectors so the demo is reproducible offline. Setting `WAYFINDER_API_BASE_URL` switches to `WayfinderLiveCoordinatorProvider`, which queries a live coordinator and falls back to fixtures on failure. The safety properties (dry-run gate, provenance binding, idempotency, receipt verification) are identical in both modes because they operate on the pathway content itself.

---

## Project Structure

```text
nyrvok/
├── docs/
│   ├── ARCHITECTURE.md          # End-to-end system architecture specification
│   ├── DESIGN.md                # Agentic devtool design system & layout specs
│   └── BOUNTY_PR.md             # Upstream KeeperHub plugin pull request documentation
├── scripts/
│   └── verify-live-execution.ts # Automated end-to-end live proof verification harness
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── telemetry/stats/ # Telemetry stats & agent reputation endpoint
│   │   │   └── waypoint/        # Ingest, simulate, and execute endpoints
│   │   ├── layout.tsx           # Root console layout
│   │   └── page.tsx             # Telemetry HUD, interactive graph, & feeds
│   ├── components/
│   │   ├── ExecutionFeed.tsx    # Live BaseScan transaction & attestation feed
│   │   ├── SimulationVerdict.tsx# Pre-flight verdict & $0.00 stand-down card
│   │   ├── TelemetryHUD.tsx     # Top telemetry bar & trust score counter
│   │   └── WaypointGraph.tsx    # Multi-hop strategy route visualizer
│   ├── lib/
│   │   ├── keeperhub/           # KeeperHub client, dry-run simulation, and Viem executor
│   │   ├── reputation/          # ERC-8004 registry logger & trust score analytics
│   │   ├── wayfinder/           # Wayfinder provider, fixtures, and failure injector
│   │   └── types.ts             # Strict TypeScript definitions
│   └── upstream/
│       └── wayfinder-plugin.ts  # Upstream KeeperHub plugin for the Bounty Track
└── test/                        # 7 comprehensive test suites (100% passing)
```

---

## License

MIT License. Built for the KeeperHub Agent Economy Hackathon on DoraHacks.
