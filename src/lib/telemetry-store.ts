import {
  TelemetryStats,
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

// Global session telemetry store
const state = {
  totalSimulations: 0,
  passedCount: 0,
  refusedCount: 0,
  gasSavedTotalUsd: 0,
  confirmedTxs: 0,
  activeNetwork: "Base Mainnet (8453)",
  walletAddress: "0x05619d1a133623b322a8f366ea9594e4e586f26d" as `0x${string}`,
  recentSimulations: [] as PathwaySimulationSummary[],
  recentExecutions: [] as PathwayExecutionSummary[],
};

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
}
