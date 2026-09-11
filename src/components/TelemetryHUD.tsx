"use client";

import React from "react";
import { FullTelemetryPayload } from "@/lib/telemetry-store";

interface TelemetryHUDProps {
  telemetry: FullTelemetryPayload | null;
  isLoading: boolean;
}

export const TelemetryHUD: React.FC<TelemetryHUDProps> = ({ telemetry, isLoading }) => {
  const shortAddress = telemetry?.walletAddress
    ? `${telemetry.walletAddress.slice(0, 6)}...${telemetry.walletAddress.slice(-4)}`
    : "0x0561...f26d";

  const trustScorePercent = telemetry?.reputation?.trustScoreBps
    ? (telemetry.reputation.trustScoreBps / 100).toFixed(1)
    : "100.0";

  const passRate =
    telemetry && telemetry.totalSimulations > 0
      ? Math.round((telemetry.passedCount / telemetry.totalSimulations) * 100)
      : 100;

  return (
    <header className="border-b border-[#1E2638] bg-[#0A0D14]/90 backdrop-blur sticky top-0 z-40">
      {/* Top Console Bar */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand identity & Mascot */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded border border-[#00F0FF]/40 bg-[#111622] flex items-center justify-center font-mono font-bold text-[#00F0FF] text-sm shadow-[0_0_12px_rgba(0,240,255,0.2)]">
            V-01
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-base text-[#F0F4FC]">NYRVOK</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-[#00E599]/30 bg-[#00E599]/10 text-[#00E599]">
                GATEWAY ACTIVE
              </span>
            </div>
            <p className="text-[11px] text-[#7E8B9F]">
              Wayfinder Autonomous Waypoint Gateway on Base
            </p>
          </div>
        </div>

        {/* Network, Wallet, and ERC-8004 Badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="px-2.5 py-1 rounded border border-[#1E2638] bg-[#111622] flex items-center gap-1.5 text-[#7E8B9F]">
            <span className="w-2 h-2 rounded-full bg-[#0052FF]"></span>
            <span>BASE (8453)</span>
          </div>

          <div className="px-2.5 py-1 rounded border border-[#1E2638] bg-[#111622] text-[#F0F4FC] flex items-center gap-1.5">
            <span className="text-[#7E8B9F]">WALLET:</span>
            <span className="text-[#00F0FF]">{shortAddress}</span>
          </div>

          <div className="px-2.5 py-1 rounded border border-[#1E2638] bg-[#111622] flex items-center gap-1.5">
            <span className="text-[#7E8B9F]">ERC-8004 TRUST:</span>
            <span className="text-[#00E599] font-bold">{trustScorePercent}%</span>
          </div>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="border-t border-[#1E2638] bg-[#111622]/40">
        <div className="max-w-7xl mx-auto px-4 py-2.5 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div className="border-r border-[#1E2638] last:border-0 pr-2">
            <div className="text-[#7E8B9F] text-[10px] uppercase tracking-wider">Simulations</div>
            <div className="font-mono text-base font-semibold text-[#F0F4FC]">
              {isLoading ? "..." : telemetry?.totalSimulations ?? 0}
            </div>
          </div>

          <div className="border-r border-[#1E2638] last:border-0 pr-2">
            <div className="text-[#7E8B9F] text-[10px] uppercase tracking-wider">Pass Rate</div>
            <div className="font-mono text-base font-semibold text-[#00E599]">
              {isLoading ? "..." : `${passRate}%`}
            </div>
          </div>

          <div className="border-r border-[#1E2638] last:border-0 pr-2">
            <div className="text-[#7E8B9F] text-[10px] uppercase tracking-wider">Halted / Refused</div>
            <div className="font-mono text-base font-semibold text-[#FF3366]">
              {isLoading ? "..." : telemetry?.refusedCount ?? 0}
            </div>
          </div>

          <div className="border-r border-[#1E2638] last:border-0 pr-2">
            <div className="text-[#7E8B9F] text-[10px] uppercase tracking-wider">Avoided Gas Loss</div>
            <div className="font-mono text-base font-semibold text-[#00F0FF]">
              {isLoading ? "..." : `$${telemetry?.gasSavedTotalUsd ?? "0.00"}`}
            </div>
          </div>

          <div>
            <div className="text-[#7E8B9F] text-[10px] uppercase tracking-wider">Confirmed On Base</div>
            <div className="font-mono text-base font-semibold text-[#F0F4FC]">
              {isLoading ? "..." : telemetry?.confirmedTxs ?? 0}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
