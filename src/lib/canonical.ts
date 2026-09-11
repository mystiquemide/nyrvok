import { createHash } from "crypto";
import { WaypointPathway, WaypointStep } from "./types";

/**
 * Canonical serialization of a waypoint step for hashing.
 * Only execution-relevant fields are included so display metadata cannot
 * alter the hash, while any change to what would actually be broadcast does.
 */
function canonicalStep(step: WaypointStep): Record<string, unknown> {
  return {
    stepIndex: step.stepIndex,
    protocol: step.protocol,
    action: step.action,
    targetAddress: typeof step.targetAddress === "string" ? step.targetAddress.toLowerCase() : step.targetAddress,
    value: step.value?.toString() ?? "0",
    functionName: step.functionName ?? null,
    functionArgs: step.functionArgs ?? null,
    abi: step.abi ?? null,
    tokenAddress: step.tokenAddress ?? null,
    recipientAddress: step.recipientAddress ?? null,
    amount: step.amount ?? null,
    maxSlippageBps: step.maxSlippageBps,
  };
}

/**
 * Deterministic SHA-256 fingerprint of a pathway's executable content.
 * Used to bind server-side simulation provenance to the exact pathway that
 * was dry-run, and to derive stable KeeperHub Idempotency-Key values.
 */
export function pathwayContentHash(pathway: WaypointPathway): string {
  const canonical = {
    pathwayId: pathway.pathwayId,
    network: pathway.network,
    steps: pathway.steps.map(canonicalStep),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Stable KeeperHub Idempotency-Key for one step of one pathway.
 * Identifies the work (not the attempt) so client retries reuse one broadcast.
 */
export function stepIdempotencyKey(pathway: WaypointPathway, step: WaypointStep): string {
  const base = pathway.idempotencyKey || pathway.pathwayId;
  const content = pathwayContentHash(pathway).slice(0, 16);
  return `nyrvok:${base}:s${step.stepIndex}:${content}`.slice(0, 64);
}
