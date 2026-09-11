import { describe, it, expect } from "vitest";
import {
  getWayfinderProvider,
  WayfinderFixtureProvider,
  STRATEGY_CATALOG,
} from "../src/lib/wayfinder/provider";
import {
  BOROS_HYPE_PATHWAY,
  MOONWELL_USDC_PATHWAY,
  AERODROME_SWAP_PATHWAY,
  FAILING_SLIPPAGE_PATHWAY,
  BASE_CONTRACTS,
} from "../src/lib/wayfinder/fixtures";
import { simulateWaypointPathway } from "../src/lib/keeperhub/simulation";
import { NyrvokKeeperHubClient } from "../src/lib/keeperhub/client";

describe("Wayfinder Provider Seam & Deterministic Fixtures", () => {
  const provider = getWayfinderProvider();

  it("lists all available strategy definitions with metadata", async () => {
    const strategies = await provider.listAvailableStrategies();
    expect(strategies.length).toBeGreaterThanOrEqual(4);

    const ids = strategies.map((s) => s.id);
    expect(ids).toContain("boros_hype");
    expect(ids).toContain("moonwell_usdc_supply");
    expect(ids).toContain("aerodrome_swap");
    expect(ids).toContain("failing_slippage_demo");

    for (const s of strategies) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.stepsCount).toBeGreaterThan(0);
      expect(s.totalValueUsd).toBeGreaterThan(0);
    }
  });

  it("returns default Boros Hype pathway when no ID is provided", async () => {
    const pathway = await provider.getPathway();
    expect(pathway.strategyId).toBe("boros_hype");
    expect(pathway.steps.length).toBe(4);
    expect(pathway.network).toBe("base-mainnet");
    expect(pathway.totalValueUsd).toBe(250.0);
  });

  it("ensures all pathway steps have valid EVM targets and calldata", async () => {
    const fixtures = [
      BOROS_HYPE_PATHWAY,
      MOONWELL_USDC_PATHWAY,
      AERODROME_SWAP_PATHWAY,
      FAILING_SLIPPAGE_PATHWAY,
    ];

    const evmAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    const hexCalldataRegex = /^0x[a-fA-F0-9]*$/;

    for (const fix of fixtures) {
      expect(fix.steps.length).toBeGreaterThan(0);
      fix.steps.forEach((step, idx) => {
        expect(step.stepIndex).toBe(idx);
        expect(step.targetAddress).toMatch(evmAddressRegex);
        expect(step.calldata).toMatch(hexCalldataRegex);
        expect(typeof step.value).toBe("bigint");
        expect(step.maxSlippageBps).toBeGreaterThanOrEqual(0);
        expect(step.label.length).toBeGreaterThan(0);
      });
    }
  });

  it("returns deep clone of pathway to ensure template immutability", async () => {
    const p1 = await provider.getPathway("boros_hype");
    const p2 = await provider.getPathway("boros_hype");

    expect(p1).not.toBe(p2); // Different object references
    expect(p1.steps).not.toBe(p2.steps);

    // Mutating p1 must not alter p2
    p1.steps[0].label = "MUTATED LABEL";
    expect(p2.steps[0].label).not.toBe("MUTATED LABEL");
  });

  it("integrates seamlessly with simulation gateway (4-step Boros Hype)", async () => {
    const pathway = await provider.getPathway("boros_hype");

    // Mock client simulating passing steps
    const mockClient = {
      simulateContractCall: async (params: { functionName: string }) => ({
        success: true,
        status: "simulated",
        wouldRevert: false,
        gasEstimate: params.functionName === "approve" ? "45000" : "135000",
      }),
      simulateTransfer: async () => ({
        success: true,
        status: "simulated",
        wouldRevert: false,
      }),
    } as unknown as NyrvokKeeperHubClient;

    const summary = await simulateWaypointPathway(pathway, mockClient);

    expect(summary.allPassed).toBe(true);
    expect(summary.totalSteps).toBe(4);
    expect(summary.passedSteps).toBe(4);
    expect(summary.refusedSteps).toBe(0);
    expect(summary.totalEstimatedGas).toBeGreaterThan(BigInt(0));
    expect(summary.totalGasSavedUsd).toBe(0);
  });
});
