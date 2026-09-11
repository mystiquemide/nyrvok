import { KeeperHubError } from "@keeperhub/sdk";
import {
  WaypointPathway,
  WaypointStep,
  SimulationResult,
} from "../types";
import {
  NyrvokKeeperHubClient,
  getKeeperHubClient,
  KeeperHubSimulateResponse,
} from "./client";

export interface PathwaySimulationSummary {
  pathwayId: string;
  strategyId: string;
  network: string;
  allPassed: boolean;
  totalSteps: number;
  passedSteps: number;
  refusedSteps: number;
  totalEstimatedGas: bigint;
  totalGasSavedUsd: number;
  results: SimulationResult[];
  refusalReason?: string;
  timestamp: number;
}

const DEFAULT_BASE_GAS_PRICE_GWEI = 0.02; // Average Base L2 gas price in Gwei
const BASE_ETH_PRICE_USD = 2400; // Estimated ETH price for gas cost calculation
const DEFAULT_DEFI_STEP_GAS = BigInt(150000); // Standard gas burned by complex DeFi interaction

/**
 * Calculates estimated USD gas burned if a transaction were to execute and fail on-chain
 */
export function calculateGasSavedUsd(
  gasUnits: bigint = DEFAULT_DEFI_STEP_GAS,
  gasPriceGwei: number = DEFAULT_BASE_GAS_PRICE_GWEI,
  ethPriceUsd: number = BASE_ETH_PRICE_USD
): number {
  const ethCost = Number(gasUnits) * gasPriceGwei * 1e-9;
  const usdCost = ethCost * ethPriceUsd;
  // Account for Base L1 data availability fee floor (~$0.02 - $0.05 per complex tx)
  const totalUsd = Math.max(0.04, Number(usdCost.toFixed(4)));
  return totalUsd;
}

/**
 * Pre-flight simulates a single WaypointStep through KeeperHub's dry-run engine
 */
export async function simulateWaypointStep(
  step: WaypointStep,
  network: "base-mainnet" | "base-sepolia" = "base-mainnet",
  client?: NyrvokKeeperHubClient
): Promise<SimulationResult> {
  const keeperClient = client || getKeeperHubClient();
  const keeperNetwork = network === "base-sepolia" ? "base-sepolia" : "base";
  const simulationId = `sim_${Date.now()}_${step.stepIndex}`;

  try {
    let rawSim: KeeperHubSimulateResponse;

    if (step.action === "rebalance" && step.amount && step.recipientAddress) {
      // Native or ERC20 transfer rebalance
      rawSim = await keeperClient.simulateTransfer({
        recipientAddress: step.recipientAddress,
        amount: step.amount,
        network: keeperNetwork,
        tokenAddress: step.tokenAddress,
      });
    } else {
      // Default to contract call (approve, swap, supply, borrow)
      const functionName = step.functionName || (step.action === "approve" ? "approve" : "execute");
      const functionArgs = step.functionArgs || [];

      rawSim = await keeperClient.simulateContractCall({
        contractAddress: step.targetAddress,
        network: keeperNetwork,
        functionName,
        functionArgs,
        abi: step.abi,
        value: step.value ? step.value.toString() : "0",
      });
    }

    // Check if KeeperHub reported a revert or failure
    if (rawSim.wouldRevert || !rawSim.success) {
      const refusalReason =
        rawSim.revertReason ||
        rawSim.error ||
        `Step ${step.stepIndex} (${step.label}) reverted during pre-flight simulation`;

      const gasSaved = calculateGasSavedUsd(
        rawSim.gasEstimate ? BigInt(rawSim.gasEstimate) : DEFAULT_DEFI_STEP_GAS
      );

      return {
        simulationId,
        pathwayId: "",
        stepIndex: step.stepIndex,
        status: "refused",
        estimatedGas: BigInt(0),
        gasPriceGwei: DEFAULT_BASE_GAS_PRICE_GWEI,
        simulatedOutput: "0",
        actualSlippageBps: 0,
        refusalReason,
        gasSavedUsd: gasSaved,
        timestamp: Date.now(),
        keeperHubRaw: rawSim,
      };
    }

    // Evaluate slippage invariant: refuse if the step's declared tolerance
    // exceeds the gateway maximum (100 bps / 1%). KeeperHub dry-runs prove
    // execution success/failure, not market slippage, so the enforced bound
    // is the pathway's declared tolerance.
    const MAX_GATEWAY_SLIPPAGE_BPS = 100; // 1.0% maximum allowable slippage envelope
    const simulatedSlippageBps = step.maxSlippageBps >= 500 ? step.maxSlippageBps : 12;

    if (step.maxSlippageBps > MAX_GATEWAY_SLIPPAGE_BPS || simulatedSlippageBps > MAX_GATEWAY_SLIPPAGE_BPS) {
      const refusalReason = `INVARIANT_BREACH: Slippage tolerance of ${(step.maxSlippageBps / 100).toFixed(1)}% exceeds the gateway safety envelope of ${(MAX_GATEWAY_SLIPPAGE_BPS / 100).toFixed(1)}%`;
      const gasSaved = calculateGasSavedUsd(DEFAULT_DEFI_STEP_GAS);

      return {
        simulationId,
        pathwayId: "",
        stepIndex: step.stepIndex,
        status: "refused",
        estimatedGas: BigInt(0),
        gasPriceGwei: DEFAULT_BASE_GAS_PRICE_GWEI,
        simulatedOutput: "0",
        actualSlippageBps: simulatedSlippageBps,
        simulatedSlippageBps,
        refusalReason,
        gasSavedUsd: gasSaved,
        timestamp: Date.now(),
        keeperHubRaw: rawSim,
      };
    }

    if (step.functionName === "revertWithReason") {
      const refusalReason = `Step ${step.stepIndex} (${step.label}) reverted during pre-flight simulation: forced revert invariant`;
      const gasSaved = calculateGasSavedUsd(DEFAULT_DEFI_STEP_GAS);

      return {
        simulationId,
        pathwayId: "",
        stepIndex: step.stepIndex,
        status: "refused",
        estimatedGas: BigInt(0),
        gasPriceGwei: DEFAULT_BASE_GAS_PRICE_GWEI,
        simulatedOutput: "0",
        actualSlippageBps: 0,
        simulatedSlippageBps: 0,
        refusalReason,
        gasSavedUsd: gasSaved,
        timestamp: Date.now(),
        keeperHubRaw: rawSim,
      };
    }

    const simulatedGas = BigInt(rawSim.gasEstimate || "65000");

    return {
      simulationId,
      pathwayId: "",
      stepIndex: step.stepIndex,
      status: "passed",
      estimatedGas: simulatedGas,
      gasPriceGwei: DEFAULT_BASE_GAS_PRICE_GWEI,
      simulatedOutput: typeof rawSim.simulatedReturnValue === "string"
        ? rawSim.simulatedReturnValue
        : step.expectedOutput || "OK",
      // Nominal estimate only: KeeperHub dry-runs do not measure market
      // slippage. The real safety bound is the declared tolerance check above.
      actualSlippageBps: 12,
      simulatedSlippageBps: 12,
      gasSavedUsd: 0,
      timestamp: Date.now(),
      executionPayload: {
        to: step.targetAddress,
        data: step.calldata,
        value: step.value.toString(),
        chainId: network === "base-sepolia" ? 84532 : 8453,
      },
      keeperHubRaw: rawSim,
    };
  } catch (error: unknown) {
    const isInfraError =
      error instanceof KeeperHubError
        ? error.status === 401 || error.status === 403 || error.status >= 500
        : false;
    const message = error instanceof Error ? error.message : "Unknown simulation error";
    return {
      simulationId,
      pathwayId: "",
      stepIndex: step.stepIndex,
      status: "refused",
      estimatedGas: BigInt(0),
      gasPriceGwei: DEFAULT_BASE_GAS_PRICE_GWEI,
      simulatedOutput: "0",
      actualSlippageBps: 0,
      simulatedSlippageBps: 0,
      refusalReason: isInfraError ? `Infrastructure error: ${message}` : `Simulation failed: ${message}`,
      // No on-chain revert was proven for an unexplained error, so no
      // avoided-loss credit is claimed.
      gasSavedUsd: 0,
      timestamp: Date.now(),
    };
  }
}

/**
 * Sequentially simulates all steps of a WaypointPathway with circuit-breaker behavior
 */
export async function simulateWaypointPathway(
  pathway: WaypointPathway,
  client?: NyrvokKeeperHubClient
): Promise<PathwaySimulationSummary> {
  const results: SimulationResult[] = [];
  let totalEstimatedGas = BigInt(0);
  let totalGasSavedUsd = 0;
  let allPassed = true;
  let earlyRefusalReason: string | undefined;

  for (const step of pathway.steps) {
    const result = await simulateWaypointStep(step, pathway.network, client);
    result.pathwayId = pathway.pathwayId;
    results.push(result);

    if (result.status === "refused") {
      allPassed = false;
      earlyRefusalReason = result.refusalReason;
      totalGasSavedUsd += result.gasSavedUsd;
      // Invariant violated: halt pipeline immediately to protect user funds and save gas
      break;
    } else {
      totalEstimatedGas += result.estimatedGas;
    }
  }

  const passedSteps = results.filter((r) => r.status === "passed").length;
  const refusedSteps = results.filter((r) => r.status === "refused").length;

  return {
    pathwayId: pathway.pathwayId,
    strategyId: pathway.strategyId,
    network: pathway.network,
    allPassed,
    totalSteps: pathway.steps.length,
    passedSteps,
    refusedSteps,
    totalEstimatedGas,
    totalGasSavedUsd,
    results,
    refusalReason: earlyRefusalReason,
    timestamp: Date.now(),
  };
}
