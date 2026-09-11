"use client";

import React from "react";
import { PathwaySimulationSummary } from "@/lib/keeperhub/simulation";

interface SimulationVerdictProps {
  summary: PathwaySimulationSummary | null;
}

export const SimulationVerdict: React.FC<SimulationVerdictProps> = ({ summary }) => {
  if (!summary) return null;

  const isRefused = !summary.allPassed;

  if (isRefused) {
    return (
      <div className="rounded border border-[#FF3366] bg-[#FF3366]/5 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF3366] animate-pulse"></span>
              <h3 className="font-mono text-sm font-bold tracking-wider text-[#FF3366] uppercase">
                SIMULATION REFUSAL: EXECUTION HALTED BEFORE BROADCAST
              </h3>
            </div>
            <p className="text-xs text-[#F0F4FC]">
              KeeperHub pre-flight dry-run detected an invariant violation on Base mainnet. Pipeline halted automatically to prevent burned gas and reverted transactions.
            </p>
          </div>

          <span className="px-2.5 py-1 text-xs font-mono rounded border border-[#FF3366] bg-[#FF3366]/10 text-[#FF3366] font-bold shrink-0">
            ZERO GAS BURNED
          </span>
        </div>

        {/* Diagnostic breakdown */}
        <div className="p-3.5 rounded bg-[#0A0D14] border border-[#FF3366]/30 space-y-2 text-xs font-mono">
          <div className="flex flex-wrap justify-between gap-2 border-b border-[#1E2638] pb-2">
            <span className="text-[#7E8B9F]">Refusal Trigger:</span>
            <span className="text-[#FF3366] font-semibold">{summary.refusalReason || "EVM Revert detected"}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
            <div>
              <span className="text-[#7E8B9F] block text-[10px]">TOTAL STEPS</span>
              <span className="text-[#F0F4FC]">{summary.totalSteps}</span>
            </div>
            <div>
              <span className="text-[#7E8B9F] block text-[10px]">HALTED AT STEP</span>
              <span className="text-[#FF3366] font-bold">Step #{summary.passedSteps + 1}</span>
            </div>
            <div>
              <span className="text-[#7E8B9F] block text-[10px]">AVOIDED GAS BURN</span>
              <span className="text-[#00F0FF] font-bold">${summary.totalGasSavedUsd.toFixed(2)} USD</span>
            </div>
            <div>
              <span className="text-[#7E8B9F] block text-[10px]">NONCE INTEGRITY</span>
              <span className="text-[#00E599] font-bold">PRESERVED</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-[#00E599]/60 bg-[#00E599]/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00E599]"></span>
          <h3 className="font-mono text-xs font-bold text-[#00E599] tracking-wider uppercase">
            PRE-FLIGHT VERIFIED: ALL WAYPOINT INVARIANTS SATISFIED
          </h3>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded border border-[#00E599]/40 bg-[#00E599]/10 text-[#00E599]">
          READY FOR TURNKEY SIGNING
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono p-3 rounded bg-[#0A0D14] border border-[#1E2638]">
        <div>
          <span className="text-[#7E8B9F] text-[10px] block">VERIFIED STEPS</span>
          <span className="text-[#F0F4FC] font-semibold">{summary.passedSteps} of {summary.totalSteps}</span>
        </div>
        <div>
          <span className="text-[#7E8B9F] text-[10px] block">TOTAL GAS ESTIMATE</span>
          <span className="text-[#00E599] font-semibold">{summary.totalEstimatedGas.toString()} units</span>
        </div>
        <div>
          <span className="text-[#7E8B9F] text-[10px] block">ESTIMATED L2 FEE</span>
          <span className="text-[#00F0FF] font-semibold">~$0.04 USD</span>
        </div>
        <div>
          <span className="text-[#7E8B9F] text-[10px] block">EXECUTION STATUS</span>
          <span className="text-[#00E599] font-semibold">APPROVED</span>
        </div>
      </div>
    </div>
  );
};
