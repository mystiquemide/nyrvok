import {
  WaypointPathway,
  WaypointStep,
  IWayfinderProvider,
  StrategyMeta,
} from "../types";
import { ALL_FIXTURES } from "./fixtures";

export type { StrategyMeta };

export const STRATEGY_CATALOG: StrategyMeta[] = [
  {
    id: "boros_hype",
    name: "Boros Hype (Aerodrome Swap + Moonwell Collateral)",
    description: "Two-stage decentralized strategy swapping USDC for WETH via Aerodrome and depositing into Moonwell money market",
    protocols: ["aerodrome", "moonwell"],
    stepsCount: 4,
    defaultNetwork: "base-mainnet",
    totalValueUsd: 50.0,
    riskTier: "medium",
  },
  {
    id: "moonwell_usdc_supply",
    name: "Moonwell Direct USDC Yield",
    description: "Direct liquidity supply to Moonwell Core on Base, capturing base lending yield with zero swap slippage",
    protocols: ["moonwell"],
    stepsCount: 2,
    defaultNetwork: "base-mainnet",
    totalValueUsd: 100.0,
    riskTier: "low",
  },
  {
    id: "aerodrome_swap",
    name: "Aerodrome Slipstream Direct Swap",
    description: "Single-hop capital rotation from USDC to WETH through Aerodrome concentrated liquidity",
    protocols: ["aerodrome"],
    stepsCount: 2,
    defaultNetwork: "base-mainnet",
    totalValueUsd: 50.0,
    riskTier: "low",
  },
  {
    id: "failing_slippage_demo",
    name: "Circuit-Breaker Invariant Stress Test",
    description: "Injected 5% slippage divergence simulating severe pool drain or sandwich attack to prove zero-gas stand-down",
    protocols: ["aerodrome", "moonwell"],
    stepsCount: 3,
    defaultNetwork: "base-mainnet",
    totalValueUsd: 50.0,
    riskTier: "stress-test",
  },
];

/**
 * Deterministic Wayfinder Provider serving recorded, production-grade pathway fixtures
 */
export class WayfinderFixtureProvider implements IWayfinderProvider {
  async listAvailableStrategies(): Promise<StrategyMeta[]> {
    return STRATEGY_CATALOG;
  }

  async getPathway(pathwayId?: string): Promise<WaypointPathway> {
    const key = pathwayId || "boros_hype";
    const template = ALL_FIXTURES[key];
    if (!template) {
      throw new Error(`Strategy or pathway template not found: ${key}`);
    }
    return this.clonePathway(template);
  }

  async getStrategyPathway(
    strategyId: string,
    network: "base-mainnet" | "base-sepolia" = "base-mainnet"
  ): Promise<WaypointPathway> {
    const template = ALL_FIXTURES[strategyId];
    if (!template) {
      throw new Error(`Strategy or pathway template not found: ${strategyId}`);
    }
    const pathway = this.clonePathway(template);
    pathway.network = network;
    return pathway;
  }

  private clonePathway(p: WaypointPathway): WaypointPathway {
    const freshDeadline = Math.floor(Date.now() / 1000) + 1800;
    return {
      ...p,
      timestamp: Date.now(),
      steps: p.steps.map((s) => {
        let functionArgs = s.functionArgs ? [...s.functionArgs] : undefined;
        if (s.action === "swap" && functionArgs && functionArgs.length >= 5) {
          functionArgs = [...functionArgs];
          functionArgs[4] = freshDeadline;
        }
        return {
          ...s,
          value: BigInt(s.value.toString()),
          functionArgs,
          abi: s.abi ? [...s.abi] : undefined,
        };
      }),
      metadata: p.metadata ? { ...p.metadata } : undefined,
    };
  }
}

/**
 * Dynamic Wayfinder Coordinator Provider
 * Queries remote Wayfinder agent coordinator if configured, with graceful fallback to fixtures
 */
export class WayfinderLiveCoordinatorProvider implements IWayfinderProvider {
  private fixtureFallback: WayfinderFixtureProvider;
  private baseUrl?: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.WAYFINDER_API_BASE_URL;
    this.fixtureFallback = new WayfinderFixtureProvider();
  }

  async listAvailableStrategies(): Promise<StrategyMeta[]> {
    if (!this.baseUrl) {
      return this.fixtureFallback.listAvailableStrategies();
    }
    try {
      const res = await fetch(`${this.baseUrl}/strategies`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as StrategyMeta[];
    } catch {
      return this.fixtureFallback.listAvailableStrategies();
    }
  }

  async getPathway(pathwayId?: string): Promise<WaypointPathway> {
    if (!this.baseUrl) {
      return this.fixtureFallback.getPathway(pathwayId);
    }
    try {
      const url = pathwayId
        ? `${this.baseUrl}/pathways/${pathwayId}`
        : `${this.baseUrl}/pathways/latest`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      return {
        ...raw,
        steps: raw.steps.map((s: WaypointStep) => ({
          ...s,
          value: BigInt(s.value || "0"),
        })),
      };
    } catch {
      return this.fixtureFallback.getPathway(pathwayId);
    }
  }

  async getStrategyPathway(
    strategyId: string,
    network?: "base-mainnet" | "base-sepolia"
  ): Promise<WaypointPathway> {
    if (!this.baseUrl) {
      return this.fixtureFallback.getStrategyPathway(strategyId, network);
    }
    try {
      const pathway = await this.getPathway(strategyId);
      if (network) {
        pathway.network = network;
      }
      return pathway;
    } catch {
      return this.fixtureFallback.getStrategyPathway(strategyId, network);
    }
  }
}

let providerInstance: IWayfinderProvider | null = null;

/**
 * Returns the live coordinator when WAYFINDER_API_BASE_URL is configured,
 * otherwise the recorded-fixture provider. The live provider itself falls
 * back to fixtures when the coordinator is unreachable, so the UI never
 * hard-fails on coordinator downtime.
 */
export function getWayfinderProvider(): IWayfinderProvider {
  if (!providerInstance) {
    providerInstance = process.env.WAYFINDER_API_BASE_URL
      ? new WayfinderLiveCoordinatorProvider()
      : new WayfinderFixtureProvider();
  }
  return providerInstance;
}
