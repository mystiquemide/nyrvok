# Nyrvok — Design System & UI Specifications

## 1. Design Direction & Tone

- **Tone Taxonomy**: **Agentic DevTool**.
  - High information density, dark-first console, crisp 1px borders, monospace telemetry numbers.
  - Linear and Vercel aesthetic. No stock gradients, no floating blobs, and no decorative animated pulsing dots.
  - Every UI element communicates deterministic state, cryptographic proof, or financial telemetry.

---

## 2. Color Palette & Design Tokens

### 2.1 Surfaces & Structure
- `bg-base`: `#0A0D14` (Deep obsidian black, primary canvas)
- `surface-panel`: `#111622` (Elevated card background)
- `surface-hover`: `#161C2C` (Interactive card hover state)
- `border-subtle`: `#1E2638` (Standard technical container border)
- `border-active`: `#2C3852` (Focused / active element border)

### 2.2 Semantic Status Accents
- `accent-cyan`: `#00F0FF` (Active Wayfinder pathway, simulating node, laser focus)
- `status-success`: `#00E599` (Mint green: simulation passed, on-chain confirmed, verified receipt)
- `status-refusal`: `#FF3366` (Coral red: simulation refused, slippage violation, zero-gas halt)
- `status-warning`: `#FFB800` (Amber: route recalculating, high network congestion)

### 2.3 Typography Colors
- `text-high`: `#F0F4FC` (High-contrast pure white for critical figures and active status)
- `text-muted`: `#7E8B9F` (Muted slate for labels, step indices, and inactive values)
- `text-dim`: `#4B5568` (Dimmed metadata, table headers, and timestamp labels)

---

## 3. Typography Hierarchy

- **UI & Structural Headings**: `Inter` / `Geist Sans`
  - Display Title: 20px / Line Height 28px / Weight 600
  - Section Heading: 14px / Line Height 20px / Weight 600 / Tracking +0.02em
  - Body Label: 12px / Line Height 16px / Weight 400
- **Telemetry, Hashes & Code**: `JetBrains Mono`
  - Hashes & Addresses: 12px / Monospace / Weight 500
  - Metrics / Counters: 16px to 24px / Monospace / Weight 600
  - Log Telemetry: 11px / Monospace / Weight 400

---

## 4. Component Wireframes & Layout

### 4.1 Global Telemetry Header
```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ NYRVOK  [GATEWAY ACTIVE] │ NETWORK: BASE (8453) │ WALLET: 0x0561...f26d │ ERC-8004 SCORE: 99.4% │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Main Command Surface
```text
┌──────────────────────────────────────┬──────────────────────────────────────────────────────────┐
│ INCOMING WAYFINDER STREAM            │ WAYPOINT GRAPH VISUALIZER                                │
│ ─────────────────────────────────── │ ──────────────────────────────────────────────────────── │
│ Strategy: boros_hype_v2             │                                                          │
│ ID: wf-9082-base                    │   [WP-1: Aerodrome] ───► [WP-2: Bridge] ───► [WP-3: Moonwell] │
│ Target: Aerodrome → Moonwell        │   (Swap 500 USDC)       (Base L2 Gate)     (Supply cbETH) │
│                                      │   STATUS: PASSED        STATUS: PASSED     STATUS: MINING │
│ [RUN PRE-FLIGHT SIMULATION]          │                                                          │
│ [INJECT 5% SLIPPAGE (FAIL TEST)]     │ Real-time latency: 42ms │ Gas Ceiling: 0.0015 ETH        │
├──────────────────────────────────────┴──────────────────────────────────────────────────────────┤
│ KEEPERHUB SIMULATION & EXECUTION TELEMETRY                                                      │
│ ─────────────────────────────────────────────────────────────────────────────────────────────── │
│ [SIMULATION STAMP]  STATUS: PASSED (Verified block 21849102)                                    │
│ Price Impact: 0.04% (Limit 0.50%) │ Gas Est: 148,291 units │ Estimated Cost: $0.082             │
│                                                                                                 │
│ [LATEST EXECUTION PROOFS - BASE MAINNET]                                                        │
│ Hash: 0x8a92f...3b14 │ Block: 21849103 │ Action: Aerodrome Swap USDC/cbETH │ Explorer: [BaseScan]│
│ Hash: 0x4c11b...99a0 │ Block: 21849104 │ Action: Moonwell Supply cbETH     │ Explorer: [BaseScan]│
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Simulation Refusal State (The Proof of Resilience)
```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚠ SIMULATION REFUSAL: EXECUTION HALTED BEFORE BROADCAST                                          │
│ ─────────────────────────────────────────────────────────────────────────────────────────────── │
│ Trigger: Injected 5.0% Slippage on Aerodrome Pool USDC/cbETH                                     │
│ KeeperHub Verdict: REJECTED (Invariant Violation: Actual Slippage 4.82% > Max Limit 0.50%)     │
│ Target Calldata: 0x38ed17390000000000000000000000000... (Unbroadcasted)                       │
│ Nonce Status: Nonce #42 Preserved │ Transactions Prevented: 3                                    │
│ CAPITAL SAVED: $500.00 │ GAS BURNED: $0.00                                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Engineering Implementation Rules

1. **No Pulsing Status Dots**: Use textual status stamps (`CONFIRMED`, `SIMULATION_PASSED`, `REFUSED`) with background badge containers.
2. **Zero Em Dashes**: Enforce strictly in all UI copy, headers, and tooltips. Use hyphens, commas, or periods.
3. **Monospace for Financials**: All token amounts, gas calculations, hashes, and block numbers must use `font-mono`.
4. **Instant Feedback**: State changes must animate within 150ms using CSS opacity transitions without layout shifts.
