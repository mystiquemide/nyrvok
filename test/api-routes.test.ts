import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as ingestGet, POST as ingestPost } from "../src/app/api/waypoint/ingest/route";
import { POST as simulatePost } from "../src/app/api/waypoint/simulate/route";
import { POST as executePost } from "../src/app/api/waypoint/execute/route";
import { GET as telemetryGet } from "../src/app/api/telemetry/stats/route";
import { BOROS_HYPE_PATHWAY } from "../src/lib/wayfinder/fixtures";
import { resetTelemetry } from "../src/lib/telemetry-store";
import { clearFeedbackLedger } from "../src/lib/reputation/erc8004";

describe("Next.js API Routes: Ingest, Simulate, Execute, Telemetry", () => {
  beforeEach(() => {
    resetTelemetry();
    clearFeedbackLedger();
  });

  it("GET /api/waypoint/ingest returns strategies and default pathway", async () => {
    const req = new NextRequest("http://localhost:3000/api/waypoint/ingest");
    const res = await ingestGet(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.strategies.length).toBeGreaterThanOrEqual(4);
    expect(data.activePathway.strategyId).toBe("boros_hype");
    expect(data.activePathway.steps.length).toBe(4);
  });

  it("POST /api/waypoint/ingest validates incoming custom pathway", async () => {
    // Missing required steps
    const invalidReq = new NextRequest("http://localhost:3000/api/waypoint/ingest", {
      method: "POST",
      body: JSON.stringify({ pathwayId: "incomplete_01" }),
    });
    const invalidRes = await ingestPost(invalidReq);
    expect(invalidRes.status).toBe(400);

    // Valid payload
    const validReq = new NextRequest("http://localhost:3000/api/waypoint/ingest", {
      method: "POST",
      body: JSON.stringify({
        pathwayId: "custom_ingested_01",
        strategyId: "aerodrome_swap",
        network: "base-mainnet",
        totalValueUsd: 150,
        steps: [
          {
            stepIndex: 0,
            protocol: "aerodrome",
            action: "approve",
            targetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            calldata: "0x",
            value: "0",
            expectedOutput: "Approved",
            maxSlippageBps: 0,
            label: "Approve Aerodrome",
          },
        ],
      }),
    });
    const validRes = await ingestPost(validReq);
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.success).toBe(true);
    expect(validData.pathway.pathwayId).toBe("custom_ingested_01");
  });

  it("POST /api/waypoint/simulate evaluates pathway and records telemetry", async () => {
    const req = new NextRequest("http://localhost:3000/api/waypoint/simulate", {
      method: "POST",
      body: JSON.stringify({
        strategyId: "boros_hype",
        network: "base-mainnet",
      }),
    });

    const res = await simulatePost(req);
    expect(res.status).toBe(200);

    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.summary).toBeDefined();
    expect(data.summary.pathwayId).toBe(BOROS_HYPE_PATHWAY.pathwayId);
    expect(data.summary.totalSteps).toBe(4);
  });

  it("POST /api/waypoint/execute enforces invariant safety gate", async () => {
    // Attempt execution without simulation
    const serializedBody = JSON.stringify(
      {
        pathway: BOROS_HYPE_PATHWAY,
        simulationResults: [],
      },
      (_, v) => (typeof v === "bigint" ? v.toString() : v)
    );

    const blockedReq = new NextRequest("http://localhost:3000/api/waypoint/execute", {
      method: "POST",
      body: serializedBody,
    });

    const blockedRes = await executePost(blockedReq);
    expect(blockedRes.status).toBe(400);

    const blockedData = await blockedRes.json();
    expect(blockedData.success).toBe(false);
    expect(blockedData.code).toBe("SAFETY_INVARIANT_VIOLATION");
  });

  it("GET /api/telemetry/stats returns session telemetry, wallet, and reputation", async () => {
    const req = new NextRequest("http://localhost:3000/api/telemetry/stats");
    const res = await telemetryGet(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.telemetry).toBeDefined();
    expect(data.telemetry.activeNetwork).toContain("Base");
    expect(data.telemetry.walletAddress).toBeDefined();
    expect(data.telemetry.reputation).toBeDefined();
    expect(data.telemetry.reputation.trustScoreBps).toBe(10000);
  });
});
