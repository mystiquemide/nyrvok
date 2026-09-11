/**
 * KeeperHub Upstream Protocol Plugin: Wayfinder Autonomous Gateway
 * 
 * Standalone plugin module for integration into KeeperHub core (github.com/KeeperHub/keeperhub).
 * Enables KeeperHub workflows and direct executors to compose, simulate, and execute
 * Wayfinder AI multi-hop DeFi pathways on Base with zero-gas invariant protection.
 */

import {
  WaypointPathway,
  SimulationResult,
  ExecutionReceipt,
  ProtocolId,
  AgentReputationSummary,
  ERC8004FeedbackRecord,
} from "../lib/types";
import { simulateWaypointPathway, PathwaySimulationSummary } from "../lib/keeperhub/simulation";
import { executeApprovedPathway, PathwayExecutionSummary } from "../lib/keeperhub/executor";
import { logPathwayExecutionFeedback, getAgentReputationSummary } from "../lib/reputation/erc8004";
import { getWayfinderProvider } from "../lib/wayfinder/provider";
import { NyrvokKeeperHubClient } from "../lib/keeperhub/client";

export interface PluginExecutionContext {
  client?: NyrvokKeeperHubClient;
  agentAddress?: `0x${string}`;
  network?: "base-mainnet" | "base-sepolia";
}

export interface IngestInput {
  strategyId?: string;
  pathwayId?: string;
  customPathway?: WaypointPathway;
}

export interface SimulateInput {
  pathway: WaypointPathway;
}

export interface ExecuteInput {
  pathway: WaypointPathway;
  simulationResults: SimulationResult[];
}

export interface ReputationInput {
  pathway: WaypointPathway;
  receipts: ExecutionReceipt[];
}

export interface KeeperHubPluginAction<TInput = Record<string, unknown>, TOutput = unknown> {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  handler: (input: TInput, context?: PluginExecutionContext) => Promise<TOutput>;
}

export interface WayfinderPluginActions {
  ingestPathway: KeeperHubPluginAction<IngestInput, WaypointPathway>;
  simulateRoute: KeeperHubPluginAction<SimulateInput, PathwaySimulationSummary>;
  executeBundle: KeeperHubPluginAction<ExecuteInput, PathwayExecutionSummary>;
  logReputation: KeeperHubPluginAction<ReputationInput, ERC8004FeedbackRecord>;
  getReputationStats: KeeperHubPluginAction<{ agentAddress?: `0x${string}` }, AgentReputationSummary>;
}

export interface KeeperHubProtocolPlugin<TActions = WayfinderPluginActions> {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  protocols: ProtocolId[];
  supportedNetworks: string[];
  actions: TActions;
}

/**
 * Wayfinder Autonomous Protocol Plugin for KeeperHub
 */
export const wayfinderProtocolPlugin: KeeperHubProtocolPlugin = {
  id: "protocol-wayfinder",
  name: "Wayfinder Autonomous Gateway",
  description:
    "Composes, simulates, and executes multi-hop Wayfinder AI pathways with Turnkey custody and ERC-8004 reputation tracking on Base.",
  version: "1.0.0",
  author: "MystiqueMide",
  protocols: ["aerodrome", "moonwell", "uniswap_v3", "bridge_base"],
  supportedNetworks: ["base-mainnet", "base-sepolia"],

  actions: {
    ingestPathway: {
      id: "ingestPathway",
      name: "Ingest Wayfinder Pathway",
      description: "Retrieves a recorded or remote Wayfinder strategy pathway with decoded steps.",
      parameters: {
        strategyId: {
          type: "string",
          description: "Strategy identifier (e.g. 'boros_hype', 'moonwell_usdc_supply', 'aerodrome_swap')",
          required: false,
        },
        pathwayId: {
          type: "string",
          description: "Explicit pathway identifier",
          required: false,
        },
      },
      handler: async (input: IngestInput, context?: PluginExecutionContext) => {
        if (input.customPathway) {
          return input.customPathway;
        }
        const provider = getWayfinderProvider();
        if (input.strategyId) {
          return provider.getStrategyPathway(input.strategyId, context?.network || "base-mainnet");
        }
        return provider.getPathway(input.pathwayId);
      },
    },

    simulateRoute: {
      id: "simulateRoute",
      name: "Pre-Flight Route Simulation",
      description:
        "Executes a zero-gas dry-run through KeeperHub's simulation engine. Blocks execution on reverts or slippage breaches.",
      parameters: {
        pathway: {
          type: "object",
          description: "The full WaypointPathway to simulate",
          required: true,
        },
      },
      handler: async (input: SimulateInput, context?: PluginExecutionContext) => {
        return simulateWaypointPathway(input.pathway, context?.client);
      },
    },

    executeBundle: {
      id: "executeBundle",
      name: "Execute Invariant-Approved Bundle",
      description:
        "Submits approved multi-hop transactions to Base mainnet through KeeperHub with Viem on-chain confirmation.",
      parameters: {
        pathway: {
          type: "object",
          description: "Target pathway to execute",
          required: true,
        },
        simulationResults: {
          type: "array",
          description: "Pre-flight simulation results proving safety invariants were satisfied",
          required: true,
        },
      },
      handler: async (input: ExecuteInput, context?: PluginExecutionContext) => {
        return executeApprovedPathway(
          input.pathway,
          input.simulationResults,
          context?.client
        );
      },
    },

    logReputation: {
      id: "logReputation",
      name: "Log ERC-8004 Reputation Attestation",
      description:
        "Records confirmed execution receipts, latency, and performance scores against the ERC-8004 Reputation Registry.",
      parameters: {
        pathway: {
          type: "object",
          description: "Target pathway",
          required: true,
        },
        receipts: {
          type: "array",
          description: "Confirmed execution receipts from Base",
          required: true,
        },
      },
      handler: async (input: ReputationInput, context?: PluginExecutionContext) => {
        return logPathwayExecutionFeedback(
          input.receipts,
          input.pathway,
          context?.agentAddress,
          context?.client
        );
      },
    },

    getReputationStats: {
      id: "getReputationStats",
      name: "Get Agent Reputation Summary",
      description: "Returns aggregated trust score bps and execution performance statistics.",
      parameters: {
        agentAddress: {
          type: "string",
          description: "The agent wallet address to inspect",
          required: false,
        },
      },
      handler: async (_input: unknown, context?: PluginExecutionContext) => {
        return getAgentReputationSummary(context?.agentAddress);
      },
    },
  },
};

export default wayfinderProtocolPlugin;
