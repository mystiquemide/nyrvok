"use client";

import React from "react";
import { ExecutionReceipt, ERC8004FeedbackRecord } from "@/lib/types";

interface ExecutionFeedProps {
  receipts: ExecutionReceipt[];
  feedbacks: ERC8004FeedbackRecord[];
}

export const ExecutionFeed: React.FC<ExecutionFeedProps> = ({ receipts, feedbacks }) => {
  return (
    <div className="rounded border border-[#1E2638] bg-[#111622] p-5 space-y-5">
      <div className="flex items-center justify-between border-b border-[#1E2638] pb-3">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#7E8B9F]">
            Cryptographic Provenance
          </span>
          <h3 className="text-sm font-semibold text-[#F0F4FC]">
            Live Base Execution Proofs & ERC-8004 Attestations
          </h3>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded border border-[#1E2638] bg-[#0A0D14] text-[#7E8B9F]">
          Viem Verified RPC
        </span>
      </div>

      {/* Receipts Table */}
      {receipts.length === 0 ? (
        <div className="p-8 rounded border border-dashed border-[#1E2638] text-center text-xs font-mono text-[#7E8B9F] space-y-1">
          <div>NO TRANSACTIONS BROADCAST YET</div>
          <div className="text-[11px] text-[#4B5568]">
            Pre-flight simulation must pass before transactions are signed and submitted to Base.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-[#1E2638] text-[#7E8B9F] text-[10px] uppercase">
                <th className="pb-2">Step</th>
                <th className="pb-2">Protocol</th>
                <th className="pb-2">Transaction Hash</th>
                <th className="pb-2">Block</th>
                <th className="pb-2">Gas Used</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">ERC-8004</th>
                <th className="pb-2 text-right">Explorer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2638]">
              {receipts.map((r, i) => (
                <tr key={i} className="hover:bg-[#161C2C]/50 transition-colors">
                  <td className="py-2.5 text-[#00F0FF]">WP-0{(r.stepIndex ?? i) + 1}</td>
                  <td className="py-2.5 text-[#F0F4FC] uppercase">{r.protocol || "EVM"}</td>
                  <td className="py-2.5 text-[#7E8B9F]">
                    {r.transactionHash
                      ? `${r.transactionHash.slice(0, 10)}...${r.transactionHash.slice(-8)}`
                      : "No on-chain hash"}
                  </td>
                  <td className="py-2.5 text-[#F0F4FC]">{r.blockNumber ? r.blockNumber.toString() : "-"}</td>
                  <td className="py-2.5 text-[#7E8B9F]">{r.gasUsed ? r.gasUsed.toString() : "-"}</td>
                  <td className="py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        r.status === "confirmed"
                          ? "bg-[#00E599]/10 text-[#00E599] border border-[#00E599]/30"
                          : "bg-[#FF3366]/10 text-[#FF3366] border border-[#FF3366]/30"
                      }`}
                    >
                      {r.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2.5">
                    {r.erc8004Logged ? (
                      <span className="text-[10px] text-[#00E599] border border-[#00E599]/30 px-1.5 py-0.5 rounded bg-[#00E599]/5">
                        SCORE {r.erc8004Score ?? 100}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#7E8B9F]">PENDING</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    {r.explorerUrl ? (
                      <a
                        href={r.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#00F0FF] hover:underline text-[11px]"
                      >
                        BaseScan ↗
                      </a>
                    ) : (
                      <span className="text-[#4B5568] text-[11px]">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ERC-8004 Recent Attestations Feed */}
      {feedbacks.length > 0 && (
        <div className="border-t border-[#1E2638] pt-3 space-y-2">
          <span className="text-[11px] font-mono text-[#7E8B9F] uppercase tracking-wider block">
            Verifiable Agent Attestations (ERC-8004 Feedback Ledger)
          </span>
          <div className="space-y-2">
            {feedbacks.slice(0, 3).map((fb) => (
              <div
                key={fb.feedbackId}
                className="p-2.5 rounded bg-[#0A0D14] border border-[#1E2638] flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[#00E599] font-bold">[{fb.score}/100]</span>
                  <span className="text-[#F0F4FC]">{fb.pathwayId}</span>
                  <span className="text-[#7E8B9F] text-[11px]">({fb.latencyMs}ms)</span>
                </div>
                <div className="text-[11px] text-[#7E8B9F] flex items-center gap-3">
                  <span>Gas: {fb.totalGasUsed.toString()}</span>
                  <span className="text-[#00F0FF]">{fb.transactionHashes.length} Txs</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
