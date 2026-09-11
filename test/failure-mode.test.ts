import { describe, it, expect } from "vitest";
import {
  injectSlippageFailure,
  injectRevertFailure,
  verifyZeroGasStandDown,
} from "../src/lib/wayfinder/failure-fixture";
import { BOROS_HYPE_PATHWAY } from "../src/lib/wayfinder/fixtures";
import { simulateWaypointPathway } from "../src/lib/keeperhub/simulation";
import { executeApprovedPathway } from "../src/lib/keeperhub/executor";
import { NyrvokKeeperHubClient } from "../src/lib/keeperhub/client";

describe("Failure-Mode Invariant Injection & Zero-Gas Stand-Down Verification", () => {
  it("injects 5% slippage into a multi-hop pathway", () => {
    const faulty = injectSlippageFailure(BOROS_HYPE_PATHWAY, 500);

    expect(faulty.pathwayId.startsWith("pw_injected_fault_")).toBe(true);
    expect(faulty.strategyId).toBe("injected_slippage_fault");

    const swapStep = faulty.steps.find((s) => s.action === "swap");
    expect(swapStep).toBeDefined();
    expect(swapStep?.maxSlippageBps).toBe(500);
    expect(swapStep?.label).toContain("[INJECTED 5% SLIPPAGE]");
  });

  it("injects forced contract revert into a specified step", () => {
    const faulty = injectRevertFailure(BOROS_HYPE_PATHWAY, 0, "ORACLE_STALE");
    expect(faulty.steps[0].label).toContain("[FORCED REVERT]");
    expect(faulty.steps[0].functionName).toBe("revertWithReason");
  });

  it("verifies pre-flight simulation circuit breaker halts execution on invariant breach", async () => {
    const faultyPathway = injectSlippageFailure(BOROS_HYPE_PATHWAY, 500);

    // Mock client simulating passing step 0 (approve) but reverting on step 1 (swap)
    const mockClient = {
      simulateContractCall: async (params: { functionName: string }) => {
        if (params.functionName === "approve") {
          return {
            success: true,
            status: "simulated",
            wouldRevert: false,
            gasEstimate: "45000",
          };
        }
        return {
          success: false,
          status: "simulated",
          wouldRevert: true,
          revertReason: "Aerodrome: INSUFFICIENT_OUTPUT_AMOUNT (Slippage Invariant Breached)",
          gasEstimate: "185000",
        };
      },
      simulateTransfer: async () => ({
        success: false,
        status: "simulated",
        wouldRevert: true,
      }),
    } as unknown as NyrvokKeeperHubClient;

    const summary = await simulateWaypointPathway(faultyPathway, mockClient);

    expect(summary.allPassed).toBe(false);
    expect(summary.totalSteps).toBe(4);
    expect(summary.passedSteps).toBe(1);
    expect(summary.refusedSteps).toBe(1);
    expect(summary.results.length).toBe(2); // Steps 2 and 3 were never simulated!
    expect(summary.refusalReason).toContain("INSUFFICIENT_OUTPUT_AMOUNT");
    expect(summary.totalGasSavedUsd).toBeGreaterThan(0);

    // Verify Zero-Gas audit proof
    const auditProof = verifyZeroGasStandDown(summary, faultyPathway.totalValueUsd);
    expect(auditProof.passedZeroGasTest).toBe(true);
    expect(auditProof.capitalProtectedUsd).toBe(250.0);
    expect(auditProof.gasBurnedUsd).toBe(0);
    expect(auditProof.preventedTransactions).toBe(3);
    expect(auditProof.noncePreserved).toBe(true);

    // Verify that attempting to broadcast to Base is strictly blocked
    await expect(
      executeApprovedPathway(faultyPathway, summary.results, mockClient)
    ).rejects.toThrow("SAFETY_INVARIANT_VIOLATION");
  });
});
