import { describe, it, expect } from "vitest";
import {
  getBasePublicClient,
  getExplorerUrl,
  executeApprovedPathway,
} from "../src/lib/keeperhub/executor";
import { SimulationResult } from "../src/lib/types";
import { BOROS_HYPE_PATHWAY } from "../src/lib/wayfinder/fixtures";
import { NyrvokKeeperHubClient } from "../src/lib/keeperhub/client";

describe("Base Execution Engine & Safety Invariants", () => {
  it("initializes Viem public client for Base Mainnet and Sepolia", async () => {
    const mainnetClient = getBasePublicClient("base-mainnet");
    expect(mainnetClient).toBeDefined();
    expect(mainnetClient.chain?.id).toBe(8453);

    const sepoliaClient = getBasePublicClient("base-sepolia");
    expect(sepoliaClient).toBeDefined();
    expect(sepoliaClient.chain?.id).toBe(84532);
  });

  it("formats BaseScan explorer URLs correctly", () => {
    const dummyHash: `0x${string}` = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const mainnetUrl = getExplorerUrl(dummyHash, "base-mainnet");
    expect(mainnetUrl).toBe(`https://basescan.org/tx/${dummyHash}`);

    const sepoliaUrl = getExplorerUrl(dummyHash, "base-sepolia");
    expect(sepoliaUrl).toBe(`https://sepolia.basescan.org/tx/${dummyHash}`);
  });

  it("STRICT SAFETY GATE: refuses execution when simulation results are missing", async () => {
    await expect(
      executeApprovedPathway(BOROS_HYPE_PATHWAY, [])
    ).rejects.toThrow("SAFETY_INVARIANT_VIOLATION");
  });

  it("STRICT SAFETY GATE: refuses execution if any step failed simulation", async () => {
    const simulationResultsWithRefusal: SimulationResult[] = [
      {
        simulationId: "sim_0",
        pathwayId: BOROS_HYPE_PATHWAY.pathwayId,
        stepIndex: 0,
        status: "passed",
        estimatedGas: BigInt(45000),
        gasPriceGwei: 0.02,
        simulatedOutput: "Approved",
        actualSlippageBps: 0,
        gasSavedUsd: 0,
        timestamp: Date.now(),
      },
      {
        simulationId: "sim_1",
        pathwayId: BOROS_HYPE_PATHWAY.pathwayId,
        stepIndex: 1,
        status: "refused",
        estimatedGas: BigInt(0),
        gasPriceGwei: 0.02,
        simulatedOutput: "0",
        actualSlippageBps: 500,
        refusalReason: "Slippage tolerance breached",
        gasSavedUsd: 0.15,
        timestamp: Date.now(),
      },
    ];

    await expect(
      executeApprovedPathway(BOROS_HYPE_PATHWAY, simulationResultsWithRefusal)
    ).rejects.toThrow("Execution blocked. Step 1 failed pre-flight simulation");
  });

  it("STRICT SAFETY GATE: refuses execution if simulation coverage is incomplete", async () => {
    // 4-step pathway with only 1 simulation result
    const partialSimResults: SimulationResult[] = [
      {
        simulationId: "sim_0",
        pathwayId: BOROS_HYPE_PATHWAY.pathwayId,
        stepIndex: 0,
        status: "passed",
        estimatedGas: BigInt(45000),
        gasPriceGwei: 0.02,
        simulatedOutput: "Approved",
        actualSlippageBps: 0,
        gasSavedUsd: 0,
        timestamp: Date.now(),
      },
    ];

    await expect(
      executeApprovedPathway(BOROS_HYPE_PATHWAY, partialSimResults)
    ).rejects.toThrow("Simulation coverage incomplete");
  });

  it("successfully executes fully simulation-approved pathway", async () => {
    // Create passing simulation results for all 4 steps
    const passingSimResults: SimulationResult[] = BOROS_HYPE_PATHWAY.steps.map((step) => ({
      simulationId: `sim_${step.stepIndex}`,
      pathwayId: BOROS_HYPE_PATHWAY.pathwayId,
      stepIndex: step.stepIndex,
      status: "passed",
      estimatedGas: BigInt(65000),
      gasPriceGwei: 0.02,
      simulatedOutput: "Success",
      actualSlippageBps: 10,
      gasSavedUsd: 0,
      timestamp: Date.now(),
    }));

    let executionCallCount = 0;
    const mockClient = {
      executeContractCall: async () => {
        executionCallCount++;
        return {
          executionId: `exec_${executionCallCount}`,
          status: "pending",
        };
      },
      executeTransfer: async () => {
        executionCallCount++;
        return {
          executionId: `exec_${executionCallCount}`,
          status: "pending",
        };
      },
      getExecutionStatus: async (id: string) => ({
        executionId: id,
        status: "completed",
        transactionHash: "0x89abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      }),
    } as unknown as NyrvokKeeperHubClient;

    const mockPublicClient = {
      getTransactionReceipt: async () => ({
        blockNumber: BigInt(12345678),
        gasUsed: BigInt(54321),
        effectiveGasPrice: BigInt(20000000),
        status: "success",
      }),
    };

    const summary = await executeApprovedPathway(
      BOROS_HYPE_PATHWAY,
      passingSimResults,
      mockClient,
      mockPublicClient
    );

    expect(summary.allSucceeded).toBe(true);
    expect(summary.totalSteps).toBe(4);
    expect(summary.completedSteps).toBe(4);
    expect(summary.failedSteps).toBe(0);
    expect(summary.receipts.length).toBe(4);

    for (const receipt of summary.receipts) {
      expect(receipt.status).toBe("confirmed");
      expect(receipt.transactionHash?.startsWith("0x")).toBe(true);
      expect(receipt.explorerUrl).toContain("basescan.org/tx/0x");
    }
  });

  it("handles missing transaction hash honestly with null and failed status (REV-1)", async () => {
    const passingSimResults: SimulationResult[] = [
      {
        simulationId: "sim_0",
        pathwayId: BOROS_HYPE_PATHWAY.pathwayId,
        stepIndex: 0,
        status: "passed",
        estimatedGas: BigInt(45000),
        gasPriceGwei: 0.02,
        simulatedOutput: "OK",
        actualSlippageBps: 10,
        gasSavedUsd: 0,
        timestamp: Date.now(),
      },
    ];

    const singleStepPathway = {
      ...BOROS_HYPE_PATHWAY,
      steps: [BOROS_HYPE_PATHWAY.steps[0]],
    };

    const mockClientNoHash = {
      executeContractCall: async () => ({
        executionId: "exec_no_hash",
        status: "pending",
      }),
      getExecutionStatus: async () => ({
        executionId: "exec_no_hash",
        status: "completed",
        // Notice: no transactionHash returned!
      }),
    } as unknown as NyrvokKeeperHubClient;

    const summary = await executeApprovedPathway(
      singleStepPathway,
      passingSimResults,
      mockClientNoHash
    );

    expect(summary.allSucceeded).toBe(false);
    expect(summary.failedSteps).toBe(1);
    expect(summary.receipts[0].status).toBe("failed");
    expect(summary.receipts[0].transactionHash).toBeNull();
    expect(summary.receipts[0].explorerUrl).toBeNull();
    expect(summary.receipts[0].failureReason).toContain("Transaction hash not returned");
  });

  it("rejects execution when simulation pathwayId does not match (REV-2)", async () => {
    const forgedSimResults: SimulationResult[] = BOROS_HYPE_PATHWAY.steps.map((step) => ({
      simulationId: `sim_${step.stepIndex}`,
      pathwayId: "FORGED_UNRELATED_PATHWAY",
      stepIndex: step.stepIndex,
      status: "passed",
      estimatedGas: BigInt(65000),
      gasPriceGwei: 0.02,
      simulatedOutput: "Success",
      actualSlippageBps: 10,
      gasSavedUsd: 0,
      timestamp: Date.now(),
    }));

    await expect(
      executeApprovedPathway(BOROS_HYPE_PATHWAY, forgedSimResults)
    ).rejects.toThrow("Simulation pathway ID mismatch");
  });

  it("rejects execution when simulation results are stale (>15m) (REV-2)", async () => {
    const staleSimResults: SimulationResult[] = BOROS_HYPE_PATHWAY.steps.map((step) => ({
      simulationId: `sim_${step.stepIndex}`,
      pathwayId: BOROS_HYPE_PATHWAY.pathwayId,
      stepIndex: step.stepIndex,
      status: "passed",
      estimatedGas: BigInt(65000),
      gasPriceGwei: 0.02,
      simulatedOutput: "Success",
      actualSlippageBps: 10,
      gasSavedUsd: 0,
      timestamp: Date.now() - 20 * 60 * 1000, // 20 minutes ago
    }));

    await expect(
      executeApprovedPathway(BOROS_HYPE_PATHWAY, staleSimResults)
    ).rejects.toThrow("Simulation results expired");
  });

  it("returns cached execution receipt on idempotent replay within 24h (REV-3)", async () => {
    const passingSimResults: SimulationResult[] = [
      {
        simulationId: "sim_0",
        pathwayId: "pw_idempotent_test",
        stepIndex: 0,
        status: "passed",
        estimatedGas: BigInt(45000),
        gasPriceGwei: 0.02,
        simulatedOutput: "OK",
        actualSlippageBps: 10,
        gasSavedUsd: 0,
        timestamp: Date.now(),
      },
    ];

    const pathwayWithKey = {
      ...BOROS_HYPE_PATHWAY,
      pathwayId: "pw_idempotent_test",
      idempotencyKey: "idem_key_unique_12345",
      steps: [BOROS_HYPE_PATHWAY.steps[0]],
    };

    let callCount = 0;
    const mockClient = {
      executeContractCall: async () => {
        callCount++;
        return {
          executionId: "exec_idem_1",
          status: "pending",
        };
      },
      getExecutionStatus: async () => ({
        executionId: "exec_idem_1",
        status: "completed",
        transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      }),
    } as unknown as NyrvokKeeperHubClient;

    const mockPublicClient = {
      getTransactionReceipt: async () => ({
        blockNumber: BigInt(12345678),
        gasUsed: BigInt(54321),
        effectiveGasPrice: BigInt(20000000),
        status: "success",
      }),
    };

    // First run: calls executor
    const summary1 = await executeApprovedPathway(
      pathwayWithKey,
      passingSimResults,
      mockClient,
      mockPublicClient
    );
    expect(callCount).toBe(1);
    expect(summary1.allSucceeded).toBe(true);

    // Second run with same idempotency key: returns cached summary without calling executor
    const summary2 = await executeApprovedPathway(
      pathwayWithKey,
      passingSimResults,
      mockClient,
      mockPublicClient
    );
    expect(callCount).toBe(1); // Call count has NOT increased!
    expect(summary2.idempotentReplay).toBe(true);
    expect(summary2.receipts[0].transactionHash).toBe(summary1.receipts[0].transactionHash);
  });

  it("treats receipt-fetch failure as failed status and records failure reason honestly (REV-1)", async () => {
    const passingSimResults: SimulationResult[] = [
      {
        simulationId: "sim_0",
        pathwayId: BOROS_HYPE_PATHWAY.pathwayId,
        stepIndex: 0,
        status: "passed",
        estimatedGas: BigInt(45000),
        gasPriceGwei: 0.02,
        simulatedOutput: "OK",
        actualSlippageBps: 10,
        gasSavedUsd: 0,
        timestamp: Date.now(),
      },
    ];

    const singleStepPathway = {
      ...BOROS_HYPE_PATHWAY,
      steps: [BOROS_HYPE_PATHWAY.steps[0]],
    };

    const mockClient = {
      executeContractCall: async () => ({
        executionId: "exec_rpc_fail",
        status: "pending",
      }),
      getExecutionStatus: async () => ({
        executionId: "exec_rpc_fail",
        status: "completed",
        transactionHash: "0x89abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567",
      }),
    } as unknown as NyrvokKeeperHubClient;

    const mockFailingPublicClient = {
      getTransactionReceipt: async () => {
        throw new Error("RPC timeout: Transaction receipt not found");
      },
    };

    const summary = await executeApprovedPathway(
      singleStepPathway,
      passingSimResults,
      mockClient,
      mockFailingPublicClient
    );

    expect(summary.allSucceeded).toBe(false);
    expect(summary.failedSteps).toBe(1);
    expect(summary.receipts[0].status).toBe("failed");
    expect(summary.receipts[0].failureReason).toContain("Receipt verification failed");
  });
});
