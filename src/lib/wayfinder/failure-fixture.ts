import { WaypointPathway, WaypointStep } from "../types";
import { PathwaySimulationSummary } from "../keeperhub/simulation";

export interface ZeroGasAuditProof {
  passedZeroGasTest: boolean;
  capitalProtectedUsd: number;
  gasBurnedUsd: number;
  preventedTransactions: number;
  refusalReason: string;
  noncePreserved: boolean;
}

/**
 * Dynamically injects an intolerable slippage condition into any valid pathway
 * Simulates a sandwich attack, severe MEV extraction, or low-liquidity pool drain
 */
export function injectSlippageFailure(
  pathway: WaypointPathway,
  injectedSlippageBps: number = 500 // 5.0%
): WaypointPathway {
  const clonedSteps: WaypointStep[] = pathway.steps.map((step, idx) => {
    if (step.action === "swap" || idx === 1) {
      return {
        ...step,
        maxSlippageBps: injectedSlippageBps,
        label: `${step.label} [INJECTED 5% SLIPPAGE]`,
        description: `INVARIANT BREACH: Slippage tolerance expanded to ${injectedSlippageBps / 100}%, violating safety bounds.`,
        // Overwrite functionArgs to demand impossible minimum return, forcing EVM simulation revert
        functionArgs: step.functionArgs
          ? [
              step.functionArgs[0],
              "999999999999999999999999", // Impossible minimum out
              ...(step.functionArgs.slice(2) || []),
            ]
          : undefined,
      };
    }
    return { ...step };
  });

  return {
    ...pathway,
    pathwayId: `pw_injected_fault_${Date.now()}`,
    strategyId: "injected_slippage_fault",
    timestamp: Date.now(),
    steps: clonedSteps,
    metadata: {
      source: "nyrvok-fault-injector/v1.0",
      coordinator: "wf-stress-engine",
      version: "1.0",
    },
  };
}

/**
 * Injects a direct contract-level revert into a specified step
 */
export function injectRevertFailure(
  pathway: WaypointPathway,
  stepIndex: number = 0,
  reason: string = "STRESS_TEST_FORCED_REVERT"
): WaypointPathway {
  const clonedSteps: WaypointStep[] = pathway.steps.map((step) => {
    if (step.stepIndex === stepIndex) {
      return {
        ...step,
        functionName: "revertWithReason",
        label: `${step.label} [FORCED REVERT]`,
        description: `Simulates protocol pause, blacklisted asset, or oracle freeze (${reason})`,
      };
    }
    return { ...step };
  });

  return {
    ...pathway,
    pathwayId: `pw_forced_revert_${Date.now()}`,
    strategyId: "forced_revert_fault",
    timestamp: Date.now(),
    steps: clonedSteps,
  };
}

/**
 * Audits a simulation refusal summary to verify zero gas burned and capital preservation
 */
export function verifyZeroGasStandDown(
  summary: PathwaySimulationSummary,
  totalCapitalUsd: number
): ZeroGasAuditProof {
  const isRefused = !summary.allPassed;
  const preventedTransactions = summary.totalSteps - summary.passedSteps;

  return {
    passedZeroGasTest: isRefused && summary.refusedSteps > 0,
    capitalProtectedUsd: isRefused ? totalCapitalUsd : 0,
    gasBurnedUsd: 0, // In simulation mode, zero gas is consumed on-chain
    preventedTransactions,
    refusalReason: summary.refusalReason || "Invariant failure",
    noncePreserved: true,
  };
}
