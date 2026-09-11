import { NextRequest } from "next/server";
import { executeApprovedPathway } from "@/lib/keeperhub/executor";
import { logPathwayExecutionFeedback } from "@/lib/reputation/erc8004";
import { WaypointPathway, SimulationResult } from "@/lib/types";
import { jsonResponse } from "@/lib/json";
import { recordExecutionTelemetry } from "@/lib/telemetry-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || !body.pathway || !Array.isArray(body.simulationResults)) {
      return jsonResponse(
        {
          success: false,
          error: "Missing required execution payload ('pathway' and 'simulationResults' are mandatory)",
        },
        { status: 400 }
      );
    }

    // Restore BigInt fields from incoming JSON payload
    const pathway: WaypointPathway = {
      ...body.pathway,
      steps: body.pathway.steps.map((s: any) => ({
        ...s,
        value: BigInt(s.value || "0"),
      })),
    };

    const simulationResults: SimulationResult[] = body.simulationResults.map(
      (r: any) => ({
        ...r,
        estimatedGas: BigInt(r.estimatedGas || "0"),
      })
    );

    // Execute approved pathway through invariant-guarded executor
    const summary = await executeApprovedPathway(pathway, simulationResults);

    // If transactions confirmed, log feedback to ERC-8004 reputation registry
    let feedbackRecord = null;
    if (summary.receipts.length > 0) {
      feedbackRecord = await logPathwayExecutionFeedback(
        summary.receipts,
        pathway
      );
    }

    // Record in session telemetry
    recordExecutionTelemetry(summary);

    return jsonResponse({
      success: true,
      summary,
      feedback: feedbackRecord,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Execution failed";
    const isInvariantViolation = message.includes("SAFETY_INVARIANT_VIOLATION");

    return jsonResponse(
      {
        success: false,
        error: message,
        code: isInvariantViolation ? "SAFETY_INVARIANT_VIOLATION" : "EXECUTION_ERROR",
      },
      { status: isInvariantViolation ? 400 : 500 }
    );
  }
}
