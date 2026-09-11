/**
 * Nyrvok Core Type Definitions & Wayfinder Pathway Schemas
 */

export type ProtocolId = "aerodrome" | "moonwell" | "uniswap_v3" | "bridge_base";

export type ActionType = "swap" | "approve" | "supply" | "borrow" | "rebalance";

export interface WaypointStep {
  stepIndex: number;
  protocol: ProtocolId;
  action: ActionType;
  targetAddress: `0x${string}`;
  calldata: `0x${string}`;
  value: bigint;
  expectedOutput: string;
  maxSlippageBps: number;
  label: string;
  description: string;
  functionName?: string;
  functionArgs?: unknown[];
  abi?: unknown[];
  tokenAddress?: `0x${string}`;
  recipientAddress?: `0x${string}`;
  amount?: string;
}

export interface WaypointPathway {
  pathwayId: string;
  strategyId: string;
  network: "base-mainnet" | "base-sepolia";
  steps: WaypointStep[];
  totalValueUsd: number;
  timestamp: number;
  metadata?: {
    source: string;
    coordinator: string;
    version: string;
  };
}

export interface SimulationResult {
  simulationId: string;
  pathwayId: string;
  stepIndex?: number;
  status: "passed" | "refused";
  estimatedGas: bigint;
  gasPriceGwei: number;
  simulatedOutput: string;
  actualSlippageBps: number;
  refusalReason?: string;
  gasSavedUsd: number;
  timestamp: number;
  executionPayload?: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    chainId: number;
  };
  keeperHubRaw?: unknown;
}

export interface ExecutionReceipt {
  executionId: string;
  pathwayId: string;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  status: "confirmed" | "failed";
  explorerUrl: string;
  erc8004Logged: boolean;
  erc8004Score?: number;
  timestamp: number;
}

export interface TelemetryStats {
  totalSimulations: number;
  passedCount: number;
  refusedCount: number;
  gasSavedTotalUsd: number;
  confirmedTxs: number;
  activeNetwork: string;
  walletAddress: `0x${string}`;
}

export interface StrategyMeta {
  id: string;
  name: string;
  description: string;
  protocols: ProtocolId[];
  stepsCount: number;
  defaultNetwork: string;
  totalValueUsd: number;
  riskTier: "low" | "medium" | "high" | "stress-test";
}

export interface IWayfinderProvider {
  getPathway(pathwayId?: string): Promise<WaypointPathway>;
  listAvailableStrategies(): Promise<StrategyMeta[]>;
  getStrategyPathway(strategyId: string, network?: "base-mainnet" | "base-sepolia"): Promise<WaypointPathway>;
}
