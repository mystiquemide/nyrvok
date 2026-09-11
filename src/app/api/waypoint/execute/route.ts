import { NextRequest } from "next/server";
import { executeApprovedPathway } from "@/lib/keeperhub/executor";
import { logPathwayExecutionFeedback } from "@/lib/reputation/erc8004";
import { WaypointPathway, WaypointStep } from "@/lib/types";
import { jsonResponse } from "@/lib/json";
import { pathwayContentHash } from "@/lib/canonical";
import {
  recordExecutionTelemetry,
  getSimulationProvenance,
} from "@/lib/telemetry-store";

/**
 * Optional shared-secret gate for deployed instances.
 * Local development runs without it; any public deployment that holds a real
 * KEEPERHUB_API_KEY should set NYRVOK_API_TOKEN so arbitrary internet callers
 * cannot drive custodial executions through this route.
 */
function isAuthorized(request: NextRequest): boolean {
  const token = process.env.NYRVOK_API_TOKEN;
  if (!token) return true;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${token}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return jsonResponse(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();

    if (!body || !body.pathway || !Array.isArray(body.pathway.steps)) {
      return jsonResponse(
        {
          success: false,
          error: "Missing required execution payload ('pathway' with 'steps' is mandatory)",
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

    // REV-2: Server-side simulation provenance gate.
    // Client-supplied simulationResults are never trusted: an execution may
    // only proceed against a dry-run this server performed itself.
    const provenance = getSimulationProvenance(pathway.pathwayId);
    if (!provenance) {
      return jsonResponse(
        {
          success: false,
          error:
            "No server-side simulation on record for this pathway. Run POST /api/waypoint/simulate first.",
          code: "SIMULATION_REQUIRED",
        },
        { status: 400 }
      );
    }

    if (provenance.pathwayHash !== pathwayContentHash(pathway)) {
      return jsonResponse(
        {
          success: false,
          error:
            "Pathway content changed since simulation. Re-run POST /api/waypoint/simulate on the exact pathway to be executed.",
          code: "PATHWAY_MISMATCH",
        },
        { status: 400 }
      );
    }

    const refused = provenance.results.find((s) => s.status === "refused");
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

    // Execute approved pathway through invariant-guarded executor
    const summary = await executeApprovedPathway(pathway, provenance.results);

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
