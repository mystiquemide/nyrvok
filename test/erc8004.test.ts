import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateExecutionScore,
  createMetadataUri,
  logPathwayExecutionFeedback,
  getAgentReputationSummary,
  clearFeedbackLedger,
  getAllFeedbackRecords,
} from "../src/lib/reputation/erc8004";
import { BOROS_HYPE_PATHWAY } from "../src/lib/wayfinder/fixtures";
import { ExecutionReceipt } from "../src/lib/types";

describe("ERC-8004 Reputation Feedback Logger", () => {
  beforeEach(() => {
    clearFeedbackLedger();
  });

  const mockReceipts: ExecutionReceipt[] = [
    {
      executionId: "exec_test_01",
      pathwayId: BOROS_HYPE_PATHWAY.pathwayId,
      stepIndex: 0,
      protocol: "aerodrome",
      transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
      blockNumber: BigInt(51180000),
      gasUsed: BigInt(45000),
      effectiveGasPrice: BigInt(20000000),
      status: "confirmed",
      explorerUrl: "https://basescan.org/tx/0x1111111111111111111111111111111111111111111111111111111111111111",
      erc8004Logged: false,
      timestamp: Date.now() - 1500,
    },
    {
      executionId: "exec_test_02",
      pathwayId: BOROS_HYPE_PATHWAY.pathwayId,
      stepIndex: 1,
      protocol: "aerodrome",
      transactionHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
      blockNumber: BigInt(51180001),
      gasUsed: BigInt(125000),
      effectiveGasPrice: BigInt(20000000),
      status: "confirmed",
      explorerUrl: "https://basescan.org/tx/0x2222222222222222222222222222222222222222222222222222222222222222",
      erc8004Logged: false,
      timestamp: Date.now() - 500,
    },
  ];

  it("calculates execution scores accurately based on outcome and latency", () => {
    // Fast confirmed execution
    const fastScore = calculateExecutionScore(mockReceipts, 1200);
    expect(fastScore).toBe(100);

    // Slower confirmed execution
    const slowScore = calculateExecutionScore(mockReceipts, 9500);
    expect(slowScore).toBe(90);

    // Failed execution
    const failedReceipts: ExecutionReceipt[] = [
      ...mockReceipts,
      {
        ...mockReceipts[0],
        status: "failed",
      },
    ];
    const failedScore = calculateExecutionScore(failedReceipts, 1200);
    expect(failedScore).toBe(0);
  });

  it("encodes valid ERC-8004 metadata URI with complete execution telemetry", () => {
    const uri = createMetadataUri(BOROS_HYPE_PATHWAY, mockReceipts, 98, 1450);
    expect(uri.startsWith("data:application/json;base64,")).toBe(true);

    const base64Part = uri.replace("data:application/json;base64,", "");
    const decoded = JSON.parse(Buffer.from(base64Part, "base64").toString("utf-8"));

    expect(decoded.standard).toBe("ERC-8004");
    expect(decoded.pathwayId).toBe(BOROS_HYPE_PATHWAY.pathwayId);
    expect(decoded.score).toBe(98);
    expect(decoded.stepCount).toBe(2);
    expect(decoded.transactions.length).toBe(2);
    expect(decoded.transactions[0].hash).toBe(mockReceipts[0].transactionHash);
  });

  it("logs pathway execution feedback and updates receipt states", async () => {
    const testReceipts: ExecutionReceipt[] = mockReceipts.map((r) => ({
      ...r,
    }));

    const feedback = await logPathwayExecutionFeedback(testReceipts, BOROS_HYPE_PATHWAY);

    expect(feedback.feedbackId.startsWith("fb_")).toBe(true);
    expect(feedback.pathwayId).toBe(BOROS_HYPE_PATHWAY.pathwayId);
    expect(feedback.score).toBeGreaterThan(0);
    expect(feedback.totalGasUsed).toBe(BigInt(170000));
    expect(feedback.transactionHashes.length).toBe(2);
    expect(feedback.metadataUri.startsWith("data:application/json;base64,")).toBe(true);

    // Verify receipt flags updated
    for (const r of testReceipts) {
      expect(r.erc8004Logged).toBe(true);
      expect(r.erc8004Score).toBe(feedback.score);
    }

    const stored = getAllFeedbackRecords();
    expect(stored.length).toBe(1);
    expect(stored[0].feedbackId).toBe(feedback.feedbackId);
  });

  it("aggregates agent reputation summary metrics and trust score bps", async () => {
    const agentAddr = "0x05619d1a133623b322a8f366ea9594e4e586f26d" as `0x${string}`;

    // Baseline before executions
    const baseline = getAgentReputationSummary(agentAddr);
    expect(baseline.totalExecutions).toBe(0);
    expect(baseline.trustScoreBps).toBe(10000);

    // Log two executions
    await logPathwayExecutionFeedback(mockReceipts, BOROS_HYPE_PATHWAY, agentAddr);
    await logPathwayExecutionFeedback(mockReceipts, BOROS_HYPE_PATHWAY, agentAddr);

    const summary = getAgentReputationSummary(agentAddr);
    expect(summary.totalExecutions).toBe(2);
    expect(summary.successfulExecutions).toBe(2);
    expect(summary.averageScore).toBeGreaterThanOrEqual(70);
    expect(summary.trustScoreBps).toBeGreaterThanOrEqual(7000);
    expect(summary.totalGasUsed).toBe(BigInt(340000));
  });
});
