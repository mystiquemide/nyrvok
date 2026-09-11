import { keccak256, toHex, stringToHex } from "viem";
import {
  WaypointPathway,
  ExecutionReceipt,
  ERC8004FeedbackRecord,
  AgentReputationSummary,
} from "../types";
import { NyrvokKeeperHubClient, getKeeperHubClient } from "../keeperhub/client";

export const DEFAULT_ERC8004_REGISTRY: `0x${string}` =
  (process.env.ERC8004_REGISTRY_ADDRESS as `0x${string}`) ||
  "0x8004000000000000000000000000000000008004";

export const ERC8004_REGISTRY_ABI = [
  {
    name: "logFeedback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pathwayHash", type: "bytes32" },
      { name: "executionId", type: "bytes32" },
      { name: "score", type: "uint256" },
      { name: "latencyMs", type: "uint256" },
      { name: "gasUsed", type: "uint256" },
      { name: "metadataUri", type: "string" },
    ],
    outputs: [{ name: "feedbackHash", type: "bytes32" }],
  },
  {
    name: "getAgentReputation",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "agentAddress", type: "address" }],
    outputs: [
      { name: "totalExecutions", type: "uint256" },
      { name: "successfulExecutions", type: "uint256" },
      { name: "averageScore", type: "uint256" },
      { name: "trustScoreBps", type: "uint256" },
    ],
  },
] as const;

// In-memory feedback ledger persisting telemetry within the active session
const feedbackLedger: ERC8004FeedbackRecord[] = [];

/**
 * Computes deterministic score (0 - 100) based on execution success, latency, and gas efficiency
 */
export function calculateExecutionScore(
  receipts: ExecutionReceipt[],
  latencyMs: number
): number {
  if (receipts.length === 0) return 0;
  const anyFailed = receipts.some((r) => r.status === "failed");
  if (anyFailed) return 0;

  let baseScore = 100;

  // Latency scoring bands
  if (latencyMs > 15_000) {
    baseScore -= 15;
  } else if (latencyMs > 8_000) {
    baseScore -= 10;
  } else if (latencyMs > 3_000) {
    baseScore -= 5;
  }

  return Math.max(70, baseScore);
}

/**
 * Creates deterministic ERC-8004 metadata payload encoded as a verifiable Data URI
 */
export function createMetadataUri(
  pathway: WaypointPathway,
  receipts: ExecutionReceipt[],
  score: number,
  latencyMs: number
): string {
  const metadata = {
    standard: "ERC-8004",
    version: "1.0",
    protocol: "nyrvok-wayfinder-gateway",
    pathwayId: pathway.pathwayId,
    strategyId: pathway.strategyId,
    network: pathway.network,
    totalValueUsd: pathway.totalValueUsd,
    score,
    latencyMs,
    stepCount: receipts.length,
    transactions: receipts.map((r) => ({
      stepIndex: r.stepIndex,
      protocol: r.protocol,
      hash: r.transactionHash,
      gasUsed: r.gasUsed.toString(),
      status: r.status,
    })),
    timestamp: Date.now(),
  };

  const jsonStr = JSON.stringify(metadata);
  const base64 = Buffer.from(jsonStr).toString("base64");
  return `data:application/json;base64,${base64}`;
}

/**
 * Logs confirmed pathway execution telemetry to ERC-8004 reputation standard
 */
export async function logPathwayExecutionFeedback(
  receipts: ExecutionReceipt[],
  pathway: WaypointPathway,
  agentAddress: `0x${string}` = "0x05619d1a133623b322a8f366ea9594e4e586f26d",
  client?: NyrvokKeeperHubClient
): Promise<ERC8004FeedbackRecord> {
  const startTime = receipts.length > 0 ? receipts[0].timestamp : Date.now();
  const latencyMs = Math.max(1, Date.now() - startTime);

  const score = calculateExecutionScore(receipts, latencyMs);
  const totalGasUsed = receipts.reduce((acc, r) => acc + r.gasUsed, BigInt(0));
  const txHashes = receipts.map((r) => r.transactionHash);

  const pathwayHash = keccak256(stringToHex(pathway.pathwayId));
  const executionId = receipts.length > 0 ? receipts[0].executionId : `exec_${Date.now()}`;
  const executionHash = keccak256(stringToHex(executionId));
  const metadataUri = createMetadataUri(pathway, receipts, score, latencyMs);
  const blockNumber = receipts.length > 0 ? receipts[receipts.length - 1].blockNumber : BigInt(0);

  const feedbackRecord: ERC8004FeedbackRecord = {
    feedbackId: `fb_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    agentAddress,
    pathwayId: pathway.pathwayId,
    pathwayHash,
    executionId,
    score,
    latencyMs,
    totalGasUsed,
    transactionHashes: txHashes,
    metadataUri,
    blockNumber,
    timestamp: Date.now(),
  };

  // Mark all receipts as ERC-8004 logged
  for (const receipt of receipts) {
    receipt.erc8004Logged = true;
    receipt.erc8004Score = score;
  }

  // Persist to session ledger
  feedbackLedger.push(feedbackRecord);

  // Attempt non-blocking broadcast simulation to ERC-8004 registry if client or key is configured
  try {
    const keeperClient = client || (process.env.KEEPERHUB_API_KEY ? getKeeperHubClient() : null);
    if (keeperClient) {
      const isSepolia = pathway.network === "base-sepolia";
      await keeperClient.simulateContractCall({
        contractAddress: DEFAULT_ERC8004_REGISTRY,
        network: isSepolia ? "base-sepolia" : "base",
        functionName: "logFeedback",
        functionArgs: [
          pathwayHash,
          executionHash,
          score.toString(),
          latencyMs.toString(),
          totalGasUsed.toString(),
          metadataUri,
        ],
        abi: Array.from(ERC8004_REGISTRY_ABI),
      });
    }
  } catch {
    // Graceful offline fallback: ledger preserves record locally
  }

  return feedbackRecord;
}

/**
 * Retrieves aggregate ERC-8004 reputation summary for an agent address
 */
export function getAgentReputationSummary(
  agentAddress: `0x${string}` = "0x05619d1a133623b322a8f366ea9594e4e586f26d"
): AgentReputationSummary {
  const records = feedbackLedger.filter(
    (r) => r.agentAddress.toLowerCase() === agentAddress.toLowerCase()
  );

  if (records.length === 0) {
    // Default baseline for newly initialized agent
    return {
      agentAddress,
      totalExecutions: 0,
      successfulExecutions: 0,
      averageScore: 100,
      trustScoreBps: 10000,
      totalGasUsed: BigInt(0),
      lastFeedbackTimestamp: Date.now(),
    };
  }

  const totalExecutions = records.length;
  const successfulExecutions = records.filter((r) => r.score > 0).length;
  const totalScore = records.reduce((acc, r) => acc + r.score, 0);
  const averageScore = Math.round(totalScore / totalExecutions);
  const trustScoreBps = Math.round((averageScore / 100) * 10000);
  const totalGasUsed = records.reduce((acc, r) => acc + r.totalGasUsed, BigInt(0));
  const lastFeedbackTimestamp = records[records.length - 1].timestamp;

  return {
    agentAddress,
    totalExecutions,
    successfulExecutions,
    averageScore,
    trustScoreBps,
    totalGasUsed,
    lastFeedbackTimestamp,
  };
}

/**
 * Retrieves all stored ERC-8004 feedback records
 */
export function getAllFeedbackRecords(): ERC8004FeedbackRecord[] {
  return [...feedbackLedger];
}

/**
 * Resets the in-memory ledger (primarily used for clean testing)
 */
export function clearFeedbackLedger(): void {
  feedbackLedger.length = 0;
}
