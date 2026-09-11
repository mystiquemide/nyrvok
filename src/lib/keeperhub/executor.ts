import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import {
  WaypointPathway,
  WaypointStep,
  SimulationResult,
  ExecutionReceipt,
} from "../types";
import {
  NyrvokKeeperHubClient,
  getKeeperHubClient,
} from "./client";
import {
  getIdempotentExecution,
  recordIdempotentExecution,
} from "../telemetry-store";

export interface PathwayExecutionSummary {
  pathwayId: string;
  strategyId: string;
  network: "base-mainnet" | "base-sepolia";
  allSucceeded: boolean;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  receipts: ExecutionReceipt[];
  totalGasUsed: bigint;
  timestamp: number;
  failureReason?: string;
  idempotentReplay?: boolean;
}

/**
 * Creates or retrieves a Viem public client for direct Base on-chain verification
 */
export function getBasePublicClient(
  network: "base-mainnet" | "base-sepolia" = "base-mainnet"
) {
  const isSepolia = network === "base-sepolia";
  const rpcUrl = isSepolia
    ? process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"
    : process.env.BASE_RPC_URL || "https://mainnet.base.org";

  if (isSepolia) {
    return createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl, {
        timeout: 15_000,
        retryCount: 3,
      }),
    });
  }

  return createPublicClient({
    chain: base,
    transport: http(rpcUrl, {
      timeout: 15_000,
      retryCount: 3,
    }),
  });
}

/**
 * Formulates the Base block explorer URL for a given transaction hash
 */
export function getExplorerUrl(
  txHash: `0x${string}`,
  network: "base-mainnet" | "base-sepolia" = "base-mainnet"
): string {
  const prefix = network === "base-sepolia" ? "https://sepolia.basescan.org" : "https://basescan.org";
  return `${prefix}/tx/${txHash}`;
}

/**
 * Executes a single approved WaypointStep through KeeperHub with on-chain Viem receipt confirmation
 */
export async function executeWaypointStep(
  step: WaypointStep,
  network: "base-mainnet" | "base-sepolia" = "base-mainnet",
  pathwayId: string = "",
  client?: NyrvokKeeperHubClient,
  publicClient?: {
    getTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<{
      blockNumber: bigint;
      gasUsed: bigint;
      effectiveGasPrice?: bigint;
      status: string;
    }>;
  }
): Promise<ExecutionReceipt> {
  const keeperClient = client || getKeeperHubClient();
  const keeperNetwork = network === "base-sepolia" ? "base-sepolia" : "base";
  const viemClient = publicClient || getBasePublicClient(network);

  let triggerRes: {
    executionId: string;
    status: string;
    transactionHash?: string;
    transactionLink?: string;
  };

  if (step.action === "rebalance" && step.amount && step.recipientAddress) {
    triggerRes = await keeperClient.executeTransfer({
      recipientAddress: step.recipientAddress,
      amount: step.amount,
      network: keeperNetwork,
      tokenAddress: step.tokenAddress,
    });
  } else {
    const functionName = step.functionName || (step.action === "approve" ? "approve" : "execute");
    const functionArgs = step.functionArgs || [];

    triggerRes = await keeperClient.executeContractCall({
      contractAddress: step.targetAddress,
      network: keeperNetwork,
      functionName,
      functionArgs,
      abi: step.abi,
      value: step.value ? step.value.toString() : "0",
    });
  }

  const executionId = triggerRes.executionId;
  const maxWaitMs = 45_000;
  const pollIntervalMs = 1_500;
  const startTime = Date.now();

  let finalTxHash: `0x${string}` | null = null;
  let finalStatus: "confirmed" | "failed" = "failed";
  let failureReason: string | undefined;

  if (triggerRes.status === "completed" || triggerRes.status === "success") {
    if (triggerRes.transactionHash && triggerRes.transactionHash.startsWith("0x")) {
      finalTxHash = triggerRes.transactionHash as `0x${string}`;
      finalStatus = "confirmed";
    }
  }

  // Poll until KeeperHub reports completion or timeout if not already confirmed
  while (!finalTxHash && Date.now() - startTime < maxWaitMs) {
    const statusData = await keeperClient.getExecutionStatus(executionId);

    if (statusData.status === "completed" || statusData.status === "success") {
      if (statusData.transactionHash && statusData.transactionHash.startsWith("0x")) {
        finalTxHash = statusData.transactionHash as `0x${string}`;
        finalStatus = "confirmed";
      }
      break;
    } else if (
      statusData.status === "failed" ||
      statusData.status === "error" ||
      statusData.status === "cancelled"
    ) {
      finalStatus = "failed";
      failureReason = statusData.error || `KeeperHub execution ${statusData.status}`;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // REV-1: Never synthesize or fabricate a transaction hash
  if (!finalTxHash) {
    finalStatus = "failed";
    failureReason = failureReason || "Transaction hash not returned by executor";
  }

  let blockNumber = BigInt(0);
  let gasUsed = BigInt(0);
  let effectiveGasPrice = BigInt(20000000); // 0.02 Gwei default

  // If a real transaction was broadcast and has a valid hash, verify directly via Viem RPC
  if (finalTxHash) {
    try {
      const receipt = await viemClient.getTransactionReceipt({ hash: finalTxHash });
      blockNumber = receipt.blockNumber;
      gasUsed = receipt.gasUsed;
      effectiveGasPrice = receipt.effectiveGasPrice || BigInt(20000000);
      finalStatus = receipt.status === "success" ? "confirmed" : "failed";
      if (receipt.status !== "success") {
        failureReason = "Transaction reverted on-chain";
      }
    } catch (err: unknown) {
      // REV-1: If receipt verification fails (hash not found or RPC error), do NOT force "confirmed"!
      finalStatus = "failed";
      failureReason = err instanceof Error ? `Receipt verification failed: ${err.message}` : "Receipt verification failed";
    }
  }

  return {
    executionId,
    pathwayId,
    stepIndex: step.stepIndex,
    protocol: step.protocol,
    transactionHash: finalTxHash,
    blockNumber,
    gasUsed,
    effectiveGasPrice,
    status: finalStatus,
    explorerUrl: finalTxHash ? getExplorerUrl(finalTxHash, network) : null,
    erc8004Logged: false,
    failureReason,
    timestamp: Date.now(),
  };
}

/**
 * Invariant-gated pathway execution engine.
 * STRICT SAFETY RULE: Refuses execution unless all steps passed simulation first.
 */
export async function executeApprovedPathway(
  pathway: WaypointPathway,
  simulationResults: SimulationResult[],
  client?: NyrvokKeeperHubClient,
  publicClient?: {
    getTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<{
      blockNumber: bigint;
      gasUsed: bigint;
      effectiveGasPrice?: bigint;
      status: string;
    }>;
  }
): Promise<PathwayExecutionSummary> {
  // REV-3: Check 24-hour deterministic idempotency cache first
  if (pathway.idempotencyKey) {
    const cached = getIdempotentExecution(pathway.idempotencyKey);
    if (cached) {
      return cached;
    }
  }

  // REV-2: Safety Invariant Check: Verify simulation results exist
  if (!simulationResults || simulationResults.length === 0) {
    throw new Error(
      "SAFETY_INVARIANT_VIOLATION: Cannot execute pathway without pre-flight simulation results"
    );
  }

  // Check if any step failed simulation first (circuit breaker refusal)
  const refusedStep = simulationResults.find((r) => r.status === "refused");
  if (refusedStep) {
    throw new Error(
      `SAFETY_INVARIANT_VIOLATION: Execution blocked. Step ${refusedStep.stepIndex} failed pre-flight simulation: ${refusedStep.refusalReason}`
    );
  }

  if (simulationResults.length !== pathway.steps.length) {
    throw new Error(
      `SAFETY_INVARIANT_VIOLATION: Simulation coverage incomplete. Expected ${pathway.steps.length} steps, got ${simulationResults.length}`
    );
  }

  const MAX_SIMULATION_AGE_MS = 15 * 60 * 1000; // 15 minute freshness window
  const now = Date.now();

  for (let i = 0; i < pathway.steps.length; i++) {
    const sim = simulationResults[i];
    if (sim.pathwayId && sim.pathwayId !== pathway.pathwayId) {
      throw new Error(
        `SAFETY_INVARIANT_VIOLATION: Simulation pathway ID mismatch. Expected ${pathway.pathwayId}, got ${sim.pathwayId}`
      );
    }
    if (sim.stepIndex !== i) {
      throw new Error(
        `SAFETY_INVARIANT_VIOLATION: Simulation step index mismatch at position ${i}. Expected ${i}, got ${sim.stepIndex}`
      );
    }
    if (sim.timestamp && now - sim.timestamp > MAX_SIMULATION_AGE_MS) {
      throw new Error(
        `SAFETY_INVARIANT_VIOLATION: Simulation results expired (older than 15 minutes)`
      );
    }
  }

  const receipts: ExecutionReceipt[] = [];
  let allSucceeded = true;
  let totalGasUsed = BigInt(0);
  let failureReason: string | undefined;

  for (const step of pathway.steps) {
    try {
      const receipt = await executeWaypointStep(
        step,
        pathway.network,
        pathway.pathwayId,
        client,
        publicClient
      );
      receipts.push(receipt);
      totalGasUsed += receipt.gasUsed;

      if (receipt.status === "failed") {
        allSucceeded = false;
        failureReason = receipt.failureReason || `Execution failed at step ${step.stepIndex} (${step.label})`;
        break; // Circuit breaker: halt on-chain execution immediately
      }
    } catch (err: unknown) {
      allSucceeded = false;
      failureReason = err instanceof Error ? err.message : "Unknown execution error";
      break;
    }
  }

  const summary: PathwayExecutionSummary = {
    pathwayId: pathway.pathwayId,
    strategyId: pathway.strategyId,
    network: pathway.network,
    allSucceeded,
    totalSteps: pathway.steps.length,
    completedSteps: receipts.filter((r) => r.status === "confirmed").length,
    failedSteps: receipts.filter((r) => r.status === "failed").length,
    receipts,
    totalGasUsed,
    timestamp: Date.now(),
    failureReason,
  };

  // REV-3: Record in idempotency cache if key provided
  if (pathway.idempotencyKey) {
    recordIdempotentExecution(pathway.idempotencyKey, summary);
  }

  return summary;
}
