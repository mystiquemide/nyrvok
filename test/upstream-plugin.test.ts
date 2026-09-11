import { describe, it, expect } from "vitest";
import { wayfinderProtocolPlugin } from "../src/upstream/wayfinder-plugin";
import { BOROS_HYPE_PATHWAY } from "../src/lib/wayfinder/fixtures";
import { NyrvokKeeperHubClient } from "../src/lib/keeperhub/client";

describe("Upstream KeeperHub Core Plugin: Wayfinder Protocol", () => {
  it("conforms to KeeperHub protocol plugin specification", () => {
    expect(wayfinderProtocolPlugin.id).toBe("protocol-wayfinder");
    expect(wayfinderProtocolPlugin.name).toContain("Wayfinder");
    expect(wayfinderProtocolPlugin.version).toBe("1.0.0");
    expect(wayfinderProtocolPlugin.protocols).toContain("aerodrome");
    expect(wayfinderProtocolPlugin.protocols).toContain("moonwell");
    expect(wayfinderProtocolPlugin.supportedNetworks).toContain("base-mainnet");

    // Must have standard action suite
    expect(wayfinderProtocolPlugin.actions.ingestPathway).toBeDefined();
    expect(wayfinderProtocolPlugin.actions.simulateRoute).toBeDefined();
    expect(wayfinderProtocolPlugin.actions.executeBundle).toBeDefined();
    expect(wayfinderProtocolPlugin.actions.logReputation).toBeDefined();
    expect(wayfinderProtocolPlugin.actions.getReputationStats).toBeDefined();
  });

  it("handles pathway ingestion through plugin action handler", async () => {
    const pathway = await wayfinderProtocolPlugin.actions.ingestPathway.handler({
      strategyId: "boros_hype",
    });

    expect(pathway).toBeDefined();
    expect(pathway.strategyId).toBe("boros_hype");
    expect(pathway.steps.length).toBe(4);
  });

  it("handles route simulation and invariant checks through plugin handler", async () => {
    const mockClient = {
      simulateContractCall: async () => ({
        success: true,
        status: "simulated",
        wouldRevert: false,
        gasEstimate: "60000",
      }),
      simulateTransfer: async () => ({
        success: true,
        status: "simulated",
        wouldRevert: false,
      }),
    } as unknown as NyrvokKeeperHubClient;

    const summary = await wayfinderProtocolPlugin.actions.simulateRoute.handler(
      { pathway: BOROS_HYPE_PATHWAY },
      { client: mockClient }
    );

    expect(summary.allPassed).toBe(true);
    expect(summary.totalSteps).toBe(4);
    expect(summary.totalEstimatedGas).toBeGreaterThan(BigInt(0));
  });

  it("strictly enforces invariant safety gate on executeBundle action", async () => {
    // Calling executeBundle without simulation results must reject
    await expect(
      wayfinderProtocolPlugin.actions.executeBundle.handler({
        pathway: BOROS_HYPE_PATHWAY,
        simulationResults: [],
      })
    ).rejects.toThrow("SAFETY_INVARIANT_VIOLATION");
  });

  it("logs ERC-8004 feedback and retrieves agent reputation summary", async () => {
    const mockReceipts = [
      {
        executionId: "exec_plugin_01",
        pathwayId: BOROS_HYPE_PATHWAY.pathwayId,
        stepIndex: 0,
        protocol: "aerodrome" as const,
        transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111" as const,
        blockNumber: BigInt(51180100),
        gasUsed: BigInt(45000),
        effectiveGasPrice: BigInt(20000000),
        status: "confirmed" as const,
        explorerUrl: "https://basescan.org/tx/0x1111111111111111111111111111111111111111111111111111111111111111",
        erc8004Logged: false,
        timestamp: Date.now(),
      },
    ];

    const feedback = await wayfinderProtocolPlugin.actions.logReputation.handler({
      pathway: BOROS_HYPE_PATHWAY,
      receipts: mockReceipts,
    });

    expect(feedback.feedbackId.startsWith("fb_")).toBe(true);
    expect(feedback.score).toBe(100);

    const repSummary = await wayfinderProtocolPlugin.actions.getReputationStats.handler({});
    expect(repSummary.trustScoreBps).toBeGreaterThanOrEqual(7000);
  });
});
