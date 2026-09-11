"use client";

import React, { useState, useEffect, useCallback } from "react";
import { TelemetryHUD } from "@/components/TelemetryHUD";
import { WaypointGraph } from "@/components/WaypointGraph";
import { SimulationVerdict } from "@/components/SimulationVerdict";
import { ExecutionFeed } from "@/components/ExecutionFeed";
import {
  WaypointPathway,
  StrategyMeta,
  SimulationResult,
  ExecutionReceipt,
} from "@/lib/types";
import { PathwaySimulationSummary } from "@/lib/keeperhub/simulation";
import { FullTelemetryPayload } from "@/lib/telemetry-store";

export default function Home() {
  const [strategies, setStrategies] = useState<StrategyMeta[]>([]);
  const [activePathway, setActivePathway] = useState<WaypointPathway | null>(null);
  const [simulationResults, setSimulationResults] = useState<SimulationResult[] | null>(null);
  const [simulationSummary, setSimulationSummary] = useState<PathwaySimulationSummary | null>(null);
  const [executionReceipts, setExecutionReceipts] = useState<ExecutionReceipt[]>([]);
  const [telemetry, setTelemetry] = useState<FullTelemetryPayload | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch("/api/telemetry/stats");
      if (res.ok) {
        const data = await res.json();
        if (data.telemetry) {
          setTelemetry(data.telemetry);
        }
      }
    } catch {
      // Ignore network hiccup
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const ingestRes = await fetch("/api/waypoint/ingest");
      if (ingestRes.ok) {
        const data = await ingestRes.json();
        setStrategies(data.strategies || []);
        setActivePathway(data.activePathway || null);
      }
      await fetchTelemetry();
    } catch {
      setStatusNotification("Failed to connect to Nyrvok API. Refresh to retry.");
    } finally {
      setIsLoading(false);
    }
  }, [fetchTelemetry]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleSelectStrategy = async (strategyId: string) => {
    setSimulationResults(null);
    setSimulationSummary(null);
    setExecutionReceipts([]);
    setStatusNotification(null);

    try {
      const res = await fetch(`/api/waypoint/ingest?strategyId=${strategyId}`);
      if (res.ok) {
        const data = await res.json();
        setActivePathway(data.activePathway);
      }
    } catch {
      setStatusNotification(`Failed to load strategy '${strategyId}'`);
    }
  };

  const handleRunSimulation = async () => {
    if (!activePathway) return;

    setIsSimulating(true);
    setStatusNotification(null);

    try {
      const res = await fetch("/api/waypoint/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathway: activePathway }),
      });

      const data = await res.json();
      if (data.success && data.summary) {
        setSimulationSummary(data.summary);
        setSimulationResults(data.summary.results);

        if (data.summary.allPassed) {
          setStatusNotification("All pre-flight simulation checks passed. Ready for Base execution.");
        } else {
          setStatusNotification(`Pre-flight simulation refused: ${data.summary.refusalReason}`);
        }
      } else {
        setStatusNotification(data.error || "Simulation error occurred");
      }
      await fetchTelemetry();
    } catch (err: unknown) {
      setStatusNotification(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setIsSimulating(false);
    }
  };

  const handleExecutePathway = async () => {
    if (!activePathway || !simulationResults) return;

    setIsExecuting(true);
    setStatusNotification(null);

    try {
      const res = await fetch("/api/waypoint/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pathway: activePathway,
          simulationResults,
        }),
      });

      const data = await res.json();
      if (data.success && data.summary) {
        setExecutionReceipts(data.summary.receipts);
        setStatusNotification(
          `Successfully landed ${data.summary.completedSteps} transaction(s) on Base mainnet via KeeperHub.`
        );
      } else {
        setStatusNotification(`Execution halted: ${data.error}`);
      }
      await fetchTelemetry();
    } catch (err: unknown) {
      setStatusNotification(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setIsExecuting(false);
    }
  };

  const handleInjectFailure = async () => {
    await handleSelectStrategy("failing_slippage_demo");
    // Trigger simulation immediately on the stress test fixture
    setTimeout(() => {
      handleRunSimulation();
    }, 150);
  };

  return (
    <div className="min-h-screen bg-[#0A0D14] text-[#F0F4FC] flex flex-col font-sans selection:bg-[#00F0FF]/30">
      {/* HUD Telemetry Navigation */}
      <TelemetryHUD telemetry={telemetry} isLoading={isLoading} />

      {/* Main Execution View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Status Notification Banner */}
        {statusNotification && (
          <div className="p-3 rounded border border-[#1E2638] bg-[#111622] flex items-center justify-between text-xs font-mono">
            <span className="text-[#F0F4FC]">{statusNotification}</span>
            <button
              onClick={() => setStatusNotification(null)}
              className="text-[#7E8B9F] hover:text-[#F0F4FC] text-sm cursor-pointer ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Waypoint Graph Node Sequence */}
        <WaypointGraph
          strategies={strategies}
          activePathway={activePathway}
          simulationResults={simulationResults}
          onSelectStrategy={handleSelectStrategy}
          onRunSimulation={handleRunSimulation}
          onExecutePathway={handleExecutePathway}
          onInjectFailure={handleInjectFailure}
          isSimulating={isSimulating}
          isExecuting={isExecuting}
        />

        {/* Proof of Resilience / Verdict Display */}
        <SimulationVerdict summary={simulationSummary} />

        {/* On-Chain Execution Receipts & ERC-8004 Proofs */}
        <ExecutionFeed
          receipts={executionReceipts}
          feedbacks={telemetry?.feedbacks || []}
        />
      </main>

      {/* Technical Footer */}
      <footer className="border-t border-[#1E2638] py-4 bg-[#0A0D14] text-xs font-mono text-[#7E8B9F]">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span>NYRVOK v1.0.0</span>
            <span>•</span>
            <span>DoraHacks KeeperHub Agent Economy Hackathon</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Base Mainnet (8453)</span>
            <a
              href="https://github.com/mystiquemide/nyrvok"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00F0FF] hover:underline"
            >
              GitHub ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
