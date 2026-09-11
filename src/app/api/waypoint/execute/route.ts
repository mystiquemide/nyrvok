import { NextRequest } from "next/server";
import { executeApprovedPathway } from "@/lib/keeperhub/executor";
import { logPathwayExecutionFeedback } from "@/lib/reputation/erc8004";
import { WaypointPathway, WaypointStep, SimulationResult } from "@/lib/types";
import { jsonResponse } from "@/lib/json";
import {
  recordExecutionTelemetry,
  getSimulationProvenance,
} from "@/lib/telemetry-store";

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
      idempotencyKey: body.idempotencyKey || body.pathway.idempotencyKey,
      steps: (body.pathway.steps as WaypointStep[]).map((s) => ({
        ...s,
        value: BigInt(s.value ? s.value.toString() : "0"),
      })),
    };

    const simulationResults: SimulationResult[] = (body.simulationResults as SimulationResult[]).map(
      (r) => ({
        ...r,
        estimatedGas: BigInt(r.estimatedGas ? r.estimatedGas.toString() : "0"),
      })
    );

    // REV-2: Server-side simulation provenance gate
    const serverSim = getSimulationProvenance(pathway.pathwayId);
    if (serverSim) {
      const refused = serverSim.find((s) => s.status === "refused");
      if (refused) {
        return jsonResponse(
          {
            success: false,
            error: `SAFETY_INVARIANT_VIOLATION: Server recorded refusal for step ${refused.stepIndex}: ${refused.refusalReason}`,
            code: "SAFETY_INVARIANT_VIOLATION",
          },
          { status: 400 }
        );
      }
    }

    // Execute approved pathway through invariant-guarded executor
    const summary = await executeApprovedPathway(pathway, serverSim || simulationResults);

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
