import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Auto-load .env.local in test environment
try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...valParts] = trimmed.split("=");
      const val = valParts.join("=");
      if (key && val && !process.env[key.trim()]) {
        process.env[key.trim()] = val.trim();
      }
    }
  }
} catch {
  // Fall back to existing process.env
}

import {
  calculateGasSavedUsd,
  simulateWaypointStep,
  simulateWaypointPathway,
} from "../src/lib/keeperhub/simulation";
import { NyrvokKeeperHubClient } from "../src/lib/keeperhub/client";
import { WaypointPathway, WaypointStep } from "../src/lib/types";

describe("KeeperHub Simulation Gateway & Invariants", () => {
  it("calculates avoided gas loss in USD accurately", () => {
    // 150k gas at 0.02 Gwei with $2400 ETH
    const saved = calculateGasSavedUsd(BigInt(150000), 0.02, 2400);
    expect(saved).toBeGreaterThanOrEqual(0.04);
  });

  it("handles simulation refusal when contract call would revert", async () => {
    // Mock client returning a revert response
    const mockClient = {
      simulateContractCall: async () => ({
        success: false,
        status: "simulated",
        wouldRevert: true,
        revertReason: "ERC20: transfer amount exceeds allowance",
        gasEstimate: "120000",
      }),
      simulateTransfer: async () => ({
        success: false,
        status: "simulated",
        wouldRevert: true,
      }),
    } as unknown as NyrvokKeeperHubClient;

    const testStep: WaypointStep = {
      stepIndex: 1,
      protocol: "aerodrome",
      action: "swap",
      targetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      calldata: "0x",
      value: BigInt(0),
      expectedOutput: "1000000",
      maxSlippageBps: 50,
      label: "Swap USDC for WETH",
      description: "Aerodrome exactInputSingle",
    };

    const result = await simulateWaypointStep(testStep, "base-mainnet", mockClient);

    expect(result.status).toBe("refused");
    expect(result.estimatedGas).toBe(BigInt(0));
    expect(result.refusalReason).toContain("ERC20: transfer amount exceeds allowance");
    expect(result.gasSavedUsd).toBeGreaterThan(0);
  });

  it("handles successful simulation when contract call passes", async () => {
    const mockClient = {
      simulateContractCall: async () => ({
        success: true,
        status: "simulated",
        wouldRevert: false,
        gasEstimate: "85000",
        simulatedReturnValue: "1005000",
      }),
    } as unknown as NyrvokKeeperHubClient;

    const testStep: WaypointStep = {
      stepIndex: 0,
      protocol: "aerodrome",
      action: "approve",
      targetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      calldata: "0x",
      value: BigInt(0),
      expectedOutput: "Approved",
      maxSlippageBps: 0,
      label: "Approve Router",
      description: "Approve Aerodrome Router to spend USDC",
    };

    const result = await simulateWaypointStep(testStep, "base-mainnet", mockClient);

    expect(result.status).toBe("passed");
    expect(result.estimatedGas).toBe(BigInt(85000));
    expect(result.gasSavedUsd).toBe(0);
  });

  it("halts multi-step pathway execution immediately on first failure (circuit breaker)", async () => {
    let stepCount = 0;

    const mockClient = {
      simulateContractCall: async (params: { functionName: string }) => {
        stepCount++;
        if (params.functionName === "failStep") {
          return {
            success: false,
            status: "simulated",
            wouldRevert: true,
            revertReason: "Slippage tolerance breached",
          };
        }
        return {
          success: true,
          status: "simulated",
          wouldRevert: false,
          gasEstimate: "45000",
        };
      },
    } as unknown as NyrvokKeeperHubClient;

    const mockPathway: WaypointPathway = {
      pathwayId: "pw_test_123",
      strategyId: "boros_hype",
      network: "base-mainnet",
      totalValueUsd: 100,
      timestamp: Date.now(),
      steps: [
        {
          stepIndex: 0,
          protocol: "aerodrome",
          action: "approve",
          targetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          calldata: "0x",
          value: BigInt(0),
          expectedOutput: "OK",
          maxSlippageBps: 0,
          label: "Step 0 - Approve",
          description: "Approve",
          functionName: "passStep",
        },
        {
          stepIndex: 1,
          protocol: "aerodrome",
          action: "swap",
          targetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          calldata: "0x",
          value: BigInt(0),
          expectedOutput: "OK",
          maxSlippageBps: 50,
          label: "Step 1 - Swap (Fails)",
          description: "Swap",
          functionName: "failStep",
        },
        {
          stepIndex: 2,
          protocol: "moonwell",
          action: "supply",
          targetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          calldata: "0x",
          value: BigInt(0),
          expectedOutput: "OK",
          maxSlippageBps: 0,
          label: "Step 2 - Supply (Never reached)",
          description: "Supply",
          functionName: "passStep",
        },
      ],
    };

    const summary = await simulateWaypointPathway(mockPathway, mockClient);

    expect(summary.allPassed).toBe(false);
    expect(summary.totalSteps).toBe(3);
    expect(summary.passedSteps).toBe(1);
    expect(summary.refusedSteps).toBe(1);
    expect(summary.results.length).toBe(2); // Step 2 was never simulated!
    expect(stepCount).toBe(2);
    expect(summary.refusalReason).toContain("Slippage tolerance breached");
    expect(summary.totalGasSavedUsd).toBeGreaterThan(0);
  });

  it("performs live simulation against KeeperHub Base mainnet endpoint", async () => {
    if (!process.env.KEEPERHUB_API_KEY) {
      console.warn("Skipping live test: KEEPERHUB_API_KEY not set");
      return;
    }

    const liveClient = new NyrvokKeeperHubClient();
    const liveStep: WaypointStep = {
      stepIndex: 0,
      protocol: "aerodrome",
      action: "approve",
      targetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base USDC
      calldata: "0x",
      value: BigInt(0),
      expectedOutput: "USDC",
      maxSlippageBps: 0,
      label: "Read USDC Symbol via Simulate",
      description: "Verify live Base read simulation",
      functionName: "symbol",
    };

    const result = await simulateWaypointStep(liveStep, "base-mainnet", liveClient);
    expect(result.status).toBe("passed");
    expect(result.simulatedOutput).toBe("USDC");
  });
});
