# Pull Request: Wayfinder Protocol Plugin for KeeperHub

- **Target Repository**: `KeeperHub/keeperhub`
- **Target Track**: DoraHacks Agent Economy Hackathon - Bounty Track: Best KeeperHub Feature ($1,000)
- **Author**: MystiqueMide (`mide27145`)
- **Plugin Identifier**: `protocol-wayfinder`
- **Source Location**: [`src/upstream/wayfinder-plugin.ts`](../src/upstream/wayfinder-plugin.ts)
- **Test Suite**: [`test/upstream-plugin.test.ts`](../test/upstream-plugin.test.ts)

---

## 1. Motivation & Problem Statement

Autonomous agent frameworks (such as Wayfinder AI) map multi-hop routes across decentralized finance protocols (e.g. Aerodrome swaps into Moonwell lending markets). 

When agents attempt direct on-chain execution without simulation:
1. **Capital Loss & Burned Gas**: Any pool imbalance, sandwich attack, or slippage breach reverts the transaction after gas has already been consumed.
2. **Broken Multi-Hop Nonces**: If step 2 of a 4-step sequence fails on-chain, downstream transactions fail or get stuck in mempools, throwing agent state out of alignment.
3. **Absence of Verifiable Provenance**: On-chain consumers have no verifiable proof of an agent's latency, execution reliability, or historical safety record.

---

## 2. Summary of Changes

This contribution packages a standalone, modular **Wayfinder Protocol Plugin** matching KeeperHub's plugin architecture:

### 2.1 Actions Introduced

1. **`ingestPathway`**
   - Ingests strategy pathways from Wayfinder Paths SDK or custom agent coordinators.
   - Validates contract targets, calldata formatting, and expected output minimums.

2. **`simulateRoute`**
   - Utilizes KeeperHub's native `simulate: true` engine across `/execute/contract-call` and `/execute/transfer`.
   - Runs sequential dry-runs with circuit-breaker behavior: halts immediately on the first failed step, preventing gas waste.
   - Computes avoided gas losses and validates slippage limits.

3. **`executeBundle`**
   - Strict Invariant Gate: Refuses to submit transactions to the mempool unless all steps have confirmed pre-flight simulation approval.
   - Executes transactions on Base through KeeperHub with managed custody.
   - Confirms block numbers and gas consumption directly against Base RPC using Viem.

4. **`logReputation`**
   - Emits standardized performance scores (0 - 100) and execution telemetry formatted according to the **ERC-8004 Reputation Registry** schema.
   - Encodes verified step hashes, transaction proofs, and timing data into verifiable Base64 Data URIs.

5. **`getReputationStats`**
   - Queries historical agent trust scores in basis points (e.g. 9940 bps = 99.4%) and total gas utilization.

---

## 3. Architecture & Integration Points

```text
┌─────────────────────────┐
│ Wayfinder AI Agent      │
│ (Route Mapping Engine)  │
└────────────┬────────────┘
             │ Ingest Pathway
             ▼
┌─────────────────────────┐
│ KeeperHub Plugin        │
│ [protocol-wayfinder]    │
└──────┬───────────┬──────┘
       │           │
       │ Pre-flight Dry-Run (simulate: true)
       ▼           ▼
┌──────────────┐ ┌──────────────────────────────────────────────┐
│ Invariant    │ │ KeeperHub Managed Custody & Viem Verification│
│ Checker      │ │ (Base Mainnet / Base Sepolia)               │
└──────────────┘ └──────────────────────┬───────────────────────┘
                                        │
                                        │ Log Feedback
                                        ▼
                         ┌──────────────────────────────┐
                         │ ERC-8004 Reputation Registry │
                         │ (Verifiable Trust Ledger)    │
                         └──────────────────────────────┘
```

---

## 4. Verification & Testing Evidence

All actions have dedicated test suites in [`test/upstream-plugin.test.ts`](../test/upstream-plugin.test.ts):

- **Conforms to Protocol Plugin Interface**: Verifies metadata, action registrations, and supported networks (Base 8453 / Base Sepolia 84532).
- **Pre-Flight Invariant Refusal**: Verifies that an invalid route triggers `status: 'refused'` and stops downstream execution.
- **Safety Gate Enforcement**: Verifies that calling `executeBundle` without passing simulation results throws `SAFETY_INVARIANT_VIOLATION`.
- **Reputation Logging**: Verifies calculation of ERC-8004 performance score and metadata URI construction.

### Test Execution Command
```bash
pnpm vitest run test/upstream-plugin.test.ts
```

All 5 plugin unit tests and 39 repository-wide tests across 7 test files pass with 0 errors.

---

## 5. Merge Checklist for KeeperHub Maintainers

- [x] Zero external native binary dependencies.
- [x] Compatible with `@keeperhub/sdk` v0.1.1 and `viem` v2.x.
- [x] Strict TypeScript types with zero `any` leaks on public interfaces.
- [x] Includes unit tests and offline fixtures.
- [x] No breaking changes to existing KeeperHub core workflows or direct executor methods.
