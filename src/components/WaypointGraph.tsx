"use client";

import React from "react";
import { WaypointPathway, StrategyMeta, SimulationResult } from "@/lib/types";

interface WaypointGraphProps {
  strategies: StrategyMeta[];
  activePathway: WaypointPathway | null;
  simulationResults: SimulationResult[] | null;
  onSelectStrategy: (strategyId: string) => void;
  onRunSimulation: () => void;
  onExecutePathway: () => void;
  onInjectFailure: () => void;
  isSimulating: boolean;
  isExecuting: boolean;
}

export const WaypointGraph: React.FC<WaypointGraphProps> = ({
  strategies,
  activePathway,
  simulationResults,
  onSelectStrategy,
  onRunSimulation,
  onExecutePathway,
  onInjectFailure,
  isSimulating,
  isExecuting,
}) => {
  const canExecute =
    simulationResults !== null &&
    simulationResults.length === (activePathway?.steps.length ?? 0) &&
    simulationResults.every((r) => r.status === "passed");

  return (
    <div className="rounded border border-[#1E2638] bg-[#111622] p-5 space-y-6">
      {/* Strategy Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E2638] pb-4">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#7E8B9F]">
            Wayfinder Strategy Ingest
          </span>
          <h2 className="text-lg font-semibold text-[#F0F4FC]">
            {activePathway?.strategyId ? activePathway.strategyId.toUpperCase().replace(/_/g, " ") : "STRATEGY ROUTE"}
          </h2>
        </div>

        {/* Strategy Tabs */}
        <div className="flex flex-wrap gap-1.5 p-1 rounded bg-[#0A0D14] border border-[#1E2638]">
          {strategies.map((strat) => {
            const isSelected = activePathway?.strategyId === strat.id;
            return (
              <button
                key={strat.id}
                onClick={() => onSelectStrategy(strat.id)}
                className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
                  isSelected
                    ? "bg-[#1E2638] text-[#00F0FF] border border-[#00F0FF]/40 font-semibold"
                    : "text-[#7E8B9F] hover:text-[#F0F4FC] hover:bg-[#161C2C]"
                }`}
              >
                {strat.id === "failing_slippage_demo" ? "⚠ Slippage Stress" : strat.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pathway Metadata Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono p-3 rounded bg-[#0A0D14]/70 border border-[#1E2638]">
        <div>
          <span className="text-[#7E8B9F] text-[10px] block uppercase">Pathway ID</span>
          <span className="text-[#F0F4FC] truncate block">{activePathway?.pathwayId}</span>
        </div>
        <div>
          <span className="text-[#7E8B9F] text-[10px] block uppercase">Route Value</span>
          <span className="text-[#00E599] font-bold">${activePathway?.totalValueUsd.toFixed(2)} USD</span>
        </div>
        <div>
          <span className="text-[#7E8B9F] text-[10px] block uppercase">Steps Count</span>
          <span className="text-[#F0F4FC]">{activePathway?.steps.length} Waypoints</span>
        </div>
        <div>
          <span className="text-[#7E8B9F] text-[10px] block uppercase">Coordinator</span>
          <span className="text-[#00F0FF] truncate block">
            {activePathway?.metadata?.coordinator || "wf-coord-base"}
          </span>
        </div>
      </div>

      {/* Interactive Waypoint Node Progression */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono uppercase tracking-wider text-[#7E8B9F]">
            Autonomous Execution Sequence
          </span>
          <span className="text-[11px] font-mono text-[#7E8B9F]">
            KeeperHub Managed Custody & Nonce Tracking
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {activePathway?.steps.map((step) => {
            const simResult = simulationResults?.find((r) => r.stepIndex === step.stepIndex);
            const isRefused = simResult?.status === "refused";
            const isPassed = simResult?.status === "passed";

            let nodeBorder = "border-[#1E2638]";
            let statusBadge = (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#1E2638] bg-[#0A0D14] text-[#7E8B9F]">
                PENDING DRY-RUN
              </span>
            );

            if (isRefused) {
              nodeBorder = "border-[#FF3366] shadow-[0_0_12px_rgba(255,51,102,0.15)]";
              statusBadge = (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#FF3366] bg-[#FF3366]/10 text-[#FF3366] font-bold">
                  SIMULATION REFUSED
                </span>
              );
            } else if (isPassed) {
              nodeBorder = "border-[#00E599]/60 shadow-[0_0_12px_rgba(0,229,153,0.1)]";
              statusBadge = (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#00E599] bg-[#00E599]/10 text-[#00E599] font-semibold">
                  PRE-FLIGHT PASSED
                </span>
              );
            }

            return (
              <div
                key={step.stepIndex}
                className={`p-3.5 rounded border ${nodeBorder} bg-[#0A0D14] space-y-2.5 transition-all`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[#00F0FF] font-semibold">WP-0{step.stepIndex + 1}</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#161C2C] text-[#7E8B9F]">
                    {step.protocol}
                  </span>
                </div>

                <div>
                  <div className="text-sm font-semibold text-[#F0F4FC]">{step.label}</div>
                  <p className="text-[11px] text-[#7E8B9F] line-clamp-2 mt-0.5">{step.description}</p>
                </div>

                <div className="border-t border-[#1E2638] pt-2 text-[11px] font-mono space-y-1 text-[#7E8B9F]">
                  <div className="flex justify-between">
                    <span>Action:</span>
                    <span className="text-[#F0F4FC] uppercase">{step.action}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Target:</span>
                    <span className="text-[#00F0FF] truncate max-w-[110px]">
                      {step.targetAddress.slice(0, 6)}...{step.targetAddress.slice(-4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max Slippage:</span>
                    <span className="text-[#F0F4FC]">{step.maxSlippageBps / 100}%</span>
                  </div>
                  {isPassed && (
                    <div className="flex justify-between text-[#00E599]">
                      <span>Gas Est:</span>
                      <span>{simResult?.estimatedGas.toString()} units</span>
                    </div>
                  )}
                </div>

                <div className="pt-1">{statusBadge}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary Action Controls */}
      <div className="border-t border-[#1E2638] pt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={onRunSimulation}
            disabled={isSimulating || isExecuting}
            className="px-4 py-2 rounded bg-[#00F0FF] text-[#0A0D14] font-mono font-semibold text-xs hover:bg-[#00F0FF]/90 transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {isSimulating ? "SIMULATING ON BASE..." : "RUN PRE-FLIGHT SIMULATION"}
          </button>

          <button
            onClick={onExecutePathway}
            disabled={!canExecute || isExecuting}
            className={`px-4 py-2 rounded font-mono font-semibold text-xs transition-colors flex items-center gap-2 ${
              canExecute
                ? "bg-[#00E599] text-[#0A0D14] hover:bg-[#00E599]/90 cursor-pointer shadow-[0_0_15px_rgba(0,229,153,0.3)]"
                : "bg-[#1E2638] text-[#7E8B9F] cursor-not-allowed opacity-60"
            }`}
          >
            {isExecuting ? "LANDING ON BASE..." : "EXECUTE ON BASE VIA KEEPERHUB"}
          </button>
        </div>

        <button
          onClick={onInjectFailure}
          disabled={isSimulating || isExecuting}
          className="px-3.5 py-2 rounded border border-[#FF3366]/40 bg-[#FF3366]/10 text-[#FF3366] font-mono text-xs hover:bg-[#FF3366]/20 transition-colors disabled:opacity-50 cursor-pointer"
        >
          INJECT 5% SLIPPAGE (STRESS TEST)
        </button>
      </div>
    </div>
  );
};
