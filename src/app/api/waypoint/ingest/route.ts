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

    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    const calldataRegex = /^0x[a-fA-F0-9]*$/;

    // Validate step addresses, calldata, and values
    for (let i = 0; i < body.steps.length; i++) {
      const step = body.steps[i] as Record<string, unknown>;
      if (!step || typeof step !== "object") {
        return jsonResponse(
          { success: false, error: `Invalid step object at index ${i}` },
          { status: 400 }
        );
      }
      if (!step.targetAddress || typeof step.targetAddress !== "string" || !addressRegex.test(step.targetAddress)) {
        return jsonResponse(
          {
            success: false,
            error: `Invalid targetAddress at step ${i}: must be a 0x-prefixed 40-character hex address`,
          },
          { status: 400 }
        );
      }
      if (step.calldata && (typeof step.calldata !== "string" || !calldataRegex.test(step.calldata))) {
        return jsonResponse(
          {
            success: false,
            error: `Invalid calldata at step ${i}: must be a valid 0x-prefixed hex string`,
          },
          { status: 400 }
        );
      }
      if (step.value !== undefined && step.value !== null) {
        try {
          BigInt(String(step.value));
        } catch {
          return jsonResponse(
            {
              success: false,
              error: `Invalid value at step ${i}: '${step.value}' is not a valid integer/BigInt`,
            },
            { status: 400 }
          );
        }
      }
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
      steps: (body.steps as Record<string, unknown>[]).map((step, index: number) => ({
        stepIndex: typeof step.stepIndex === "number" ? step.stepIndex : index,
        protocol: (step.protocol as WaypointPathway["steps"][number]["protocol"]) || "aerodrome",
        action: (step.action as WaypointPathway["steps"][number]["action"]) || "swap",
        targetAddress: step.targetAddress as `0x${string}`,
        calldata: (step.calldata as `0x${string}`) || "0x",
        value: BigInt(step.value ? String(step.value) : "0"),
        expectedOutput: typeof step.expectedOutput === "string" ? step.expectedOutput : "OK",
        maxSlippageBps: Number(step.maxSlippageBps || 0),
        label: typeof step.label === "string" ? step.label : `Step ${index + 1}`,
        description: typeof step.description === "string" ? step.description : "",
        functionName: typeof step.functionName === "string" ? step.functionName : undefined,
        functionArgs: Array.isArray(step.functionArgs) ? step.functionArgs : undefined,
        abi: Array.isArray(step.abi) ? step.abi : undefined,
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
