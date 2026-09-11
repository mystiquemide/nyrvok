import { NextRequest } from "next/server";
import { getWayfinderProvider } from "@/lib/wayfinder/provider";
import { WaypointPathway } from "@/lib/types";
import { jsonResponse } from "@/lib/json";

export async function GET(request: NextRequest) {
  try {
    const provider = getWayfinderProvider();
    const searchParams = request.nextUrl.searchParams;
    const strategyId = searchParams.get("strategyId") || undefined;
    const pathwayId = searchParams.get("pathwayId") || undefined;
    const network = (searchParams.get("network") as "base-mainnet" | "base-sepolia") || "base-mainnet";

    const strategies = await provider.listAvailableStrategies();

    let activePathway: WaypointPathway;
    if (strategyId) {
      activePathway = await provider.getStrategyPathway(strategyId, network);
    } else {
      activePathway = await provider.getPathway(pathwayId);
    }

    return jsonResponse({
      success: true,
      strategies,
      activePathway,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to ingest pathway";
    return jsonResponse({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || !body.pathwayId || !Array.isArray(body.steps)) {
      return jsonResponse(
        {
          success: false,
          error: "Invalid pathway payload. Must contain 'pathwayId' and 'steps' array.",
        },
        { status: 400 }
      );
    }

    // Parse and normalize steps with BigInt values
    const pathway: WaypointPathway = {
      pathwayId: body.pathwayId,
      strategyId: body.strategyId || "custom_waypoint",
      network: body.network === "base-sepolia" ? "base-sepolia" : "base-mainnet",
      totalValueUsd: Number(body.totalValueUsd || 0),
      timestamp: Date.now(),
      metadata: body.metadata || {
        source: "external-wayfinder-coordinator",
        coordinator: "http-ingest",
        version: "1.0",
      },
      steps: body.steps.map((step: any, index: number) => ({
        stepIndex: typeof step.stepIndex === "number" ? step.stepIndex : index,
        protocol: step.protocol || "aerodrome",
        action: step.action || "swap",
        targetAddress: step.targetAddress,
        calldata: step.calldata || "0x",
        value: BigInt(step.value || "0"),
        expectedOutput: step.expectedOutput || "OK",
        maxSlippageBps: Number(step.maxSlippageBps || 0),
        label: step.label || `Step ${index + 1}`,
        description: step.description || "",
        functionName: step.functionName,
        functionArgs: step.functionArgs,
        abi: step.abi,
      })),
    };

    return jsonResponse({
      success: true,
      message: `Pathway '${pathway.pathwayId}' ingested with ${pathway.steps.length} steps`,
      pathway,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Pathway ingestion error";
    return jsonResponse({ success: false, error: message }, { status: 500 });
  }
}
