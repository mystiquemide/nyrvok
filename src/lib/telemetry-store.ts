import {
  TelemetryStats,
  SimulationResult,
} from "./types";
import { PathwaySimulationSummary } from "./keeperhub/simulation";
import { PathwayExecutionSummary } from "./keeperhub/executor";
import { getAgentReputationSummary, getAllFeedbackRecords } from "./reputation/erc8004";

export interface FullTelemetryPayload extends TelemetryStats {
  recentSimulations: PathwaySimulationSummary[];
  recentExecutions: PathwayExecutionSummary[];
  reputation: ReturnType<typeof getAgentReputationSummary>;
  feedbacks: ReturnType<typeof getAllFeedbackRecords>;
}

// 24-hour TTL for idempotency cache (PRD AC-05)
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const idempotencyStore = new Map<string, { summary: PathwayExecutionSummary; timestamp: number }>();

// Server-owned simulation provenance store (ADR-02 / REV-2)
const simulationProvenanceStore = new Map<string, { results: SimulationResult[]; timestamp: number }>();

const defaultNetworkName =
  process.env.DEFAULT_NETWORK === "base-sepolia"
    ? "Base Sepolia (84532)"
    : "Base Mainnet (8453)";

// Global session telemetry store
const state = {
  totalSimulations: 0,
  passedCount: 0,
  refusedCount: 0,
  gasSavedTotalUsd: 0,
  confirmedTxs: 0,
  activeNetwork: defaultNetworkName,
  walletAddress: "0x05619d1a133623b322a8f366ea9594e4e586f26d" as `0x${string}`,
  recentSimulations: [] as PathwaySimulationSummary[],
  recentExecutions: [] as PathwayExecutionSummary[],
};

export function setActiveNetwork(network: string): void {
  if (network === "base-sepolia" || network.includes("sepolia") || network.includes("84532")) {
    state.activeNetwork = "Base Sepolia (84532)";
  } else {
    state.activeNetwork = "Base Mainnet (8453)";
  }
}

export function recordIdempotentExecution(
  idempotencyKey: string,
  summary: PathwayExecutionSummary
): void {
  idempotencyStore.set(idempotencyKey, {
    summary,
    timestamp: Date.now(),
  });
}

export function getIdempotentExecution(
  idempotencyKey: string
): PathwayExecutionSummary | null {
  const record = idempotencyStore.get(idempotencyKey);
  if (!record) return null;
  if (Date.now() - record.timestamp > IDEMPOTENCY_TTL_MS) {
    idempotencyStore.delete(idempotencyKey);
    return null;
  }
  return {
    ...record.summary,
    idempotentReplay: true,
  };
}

export function recordSimulationProvenance(
  pathwayId: string,
  results: SimulationResult[]
): void {
  simulationProvenanceStore.set(pathwayId, {
    results,
    timestamp: Date.now(),
  });
}

export function getSimulationProvenance(
  pathwayId: string
): SimulationResult[] | null {
  const record = simulationProvenanceStore.get(pathwayId);
  if (!record) return null;
  // Provenance freshness window: 15 minutes
  if (Date.now() - record.timestamp > 15 * 60 * 1000) {
    simulationProvenanceStore.delete(pathwayId);
    return null;
  }
  return record.results;
}

export function recordSimulationTelemetry(summary: PathwaySimulationSummary): void {
  state.totalSimulations++;
  if (summary.allPassed) {
    state.passedCount++;
  } else {
    state.refusedCount++;
    state.gasSavedTotalUsd += summary.totalGasSavedUsd;
  }
  state.recentSimulations.unshift(summary);
  if (state.recentSimulations.length > 20) {
    state.recentSimulations.pop();
  }
  if (summary.results) {
    recordSimulationProvenance(summary.pathwayId, summary.results);
  }
}

export function recordExecutionTelemetry(summary: PathwayExecutionSummary): void {
  state.confirmedTxs += summary.completedSteps;
  state.recentExecutions.unshift(summary);
  if (state.recentExecutions.length > 20) {
    state.recentExecutions.pop();
  }
}

export function getTelemetryPayload(): FullTelemetryPayload {
  return {
    totalSimulations: state.totalSimulations,
    passedCount: state.passedCount,
    refusedCount: state.refusedCount,
    gasSavedTotalUsd: Number(state.gasSavedTotalUsd.toFixed(2)),
    confirmedTxs: state.confirmedTxs,
    activeNetwork: state.activeNetwork,
    walletAddress: state.walletAddress,
    recentSimulations: [...state.recentSimulations],
    recentExecutions: [...state.recentExecutions],
    reputation: getAgentReputationSummary(state.walletAddress),
    feedbacks: getAllFeedbackRecords().slice(-10),
  };
}

export function resetTelemetry(): void {
  state.totalSimulations = 0;
  state.passedCount = 0;
  state.refusedCount = 0;
  state.gasSavedTotalUsd = 0;
  state.confirmedTxs = 0;
  state.recentSimulations = [];
  state.recentExecutions = [];
  idempotencyStore.clear();
  simulationProvenanceStore.clear();
}
