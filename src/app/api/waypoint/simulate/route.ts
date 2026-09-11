import { NextRequest } from "next/server";
import { simulateWaypointPathway } from "@/lib/keeperhub/simulation";
import { getWayfinderProvider } from "@/lib/wayfinder/provider";
import { WaypointPathway, WaypointStep } from "@/lib/types";
import { jsonResponse } from "@/lib/json";
import { recordSimulationTelemetry } from "@/lib/telemetry-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let pathway: WaypointPathway;

    if (body.pathway && Array.isArray(body.pathway.steps)) {
      // Incoming serialized pathway: ensure BigInt fields are restored
      pathway = {
        ...body.pathway,
        steps: (body.pathway.steps as WaypointStep[]).map((s) => ({
          ...s,
          value: BigInt(s.value ? s.value.toString() : "0"),
        })),
      };
    } else if (body.strategyId) {
      const provider = getWayfinderProvider();
      pathway = await provider.getStrategyPathway(
        body.strategyId,
        body.network || "base-mainnet"
      );
    } else {
      const provider = getWayfinderProvider();
      pathway = await provider.getPathway();
    }

    const summary = await simulateWaypointPathway(pathway);

    // Track in session telemetry
    recordSimulationTelemetry(summary);

    return jsonResponse({
      success: true,
      summary,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Simulation failure";
    return jsonResponse({ success: false, error: message }, { status: 500 });
  }
}
