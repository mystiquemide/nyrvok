import { KeeperHubClient, KeeperHubError } from "@keeperhub/sdk";

export interface KeeperHubSimulateResponse {
  success: boolean;
  status: "simulated" | string;
  from?: string;
  to?: string;
  value?: string;
  gasEstimate?: string;
  simulatedReturnValue?: unknown;
  wouldRevert?: boolean;
  failureKind?: "revert" | "validation" | string;
  revertReason?: string;
  error?: string;
  code?: string;
  balanceWei?: string;
  requiredWei?: string;
}

export interface ContractCallParams {
  contractAddress: `0x${string}` | string;
  network?: string;
  functionName: string;
  functionArgs?: unknown[];
  abi?: unknown[];
  value?: string;
  idempotencyKey?: string;
}

export interface TransferParams {
  recipientAddress: `0x${string}` | string;
  amount: string;
  network?: string;
  tokenAddress?: `0x${string}` | string;
  idempotencyKey?: string;
}

/**
 * Maps internal network names to numeric EVM chain IDs.
 * KeeperHub's current API takes `chainId`; the legacy `network` field is deprecated.
 */
function chainIdFor(network?: string): number {
  return network === "base-sepolia" ? 84532 : 8453;
}

export interface KeeperHubUserInfo {
  id: string;
  name: string;
  email?: string;
  walletAddress: `0x${string}`;
}

export class NyrvokKeeperHubClient {
  private client: KeeperHubClient;
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    const resolvedKey = apiKey || process.env.KEEPERHUB_API_KEY;
    if (!resolvedKey) {
      throw new Error("KEEPERHUB_API_KEY is required to initialize NyrvokKeeperHubClient");
    }
    this.apiKey = resolvedKey;
    let resolvedBaseUrl = baseUrl || process.env.KEEPERHUB_BASE_URL || "https://app.keeperhub.com/api";
    resolvedBaseUrl = resolvedBaseUrl.replace(/\/$/, "");
    if (!resolvedBaseUrl.endsWith("/api")) {
      resolvedBaseUrl = `${resolvedBaseUrl}/api`;
    }
    this.baseUrl = resolvedBaseUrl;

    const customFetch: typeof fetch = (url, init = {}) => {
      const headers = new Headers(init.headers || {});
      if (!headers.has("User-Agent")) {
        headers.set(
          "User-Agent",
          "Nyrvok-Gateway/1.0 (KeeperHub-Agent-Economy; +https://github.com/mystiquemide/nyrvok)"
        );
      }
      return fetch(url, { ...init, headers });
    };

    this.client = new KeeperHubClient({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      fetch: customFetch,
    });
  }

  getRawClient(): KeeperHubClient {
    return this.client;
  }

  async getUser(): Promise<KeeperHubUserInfo> {
    return this.client.rawRequest<KeeperHubUserInfo>("/user");
  }

  async simulateContractCall(params: ContractCallParams): Promise<KeeperHubSimulateResponse> {
    const payload: Record<string, unknown> = {
      contractAddress: params.contractAddress,
      chainId: chainIdFor(params.network),
      functionName: params.functionName,
      simulate: true,
    };

    if (params.functionArgs && params.functionArgs.length > 0) {
      payload.functionArgs = JSON.stringify(params.functionArgs);
    }
    if (params.abi && params.abi.length > 0) {
      payload.abi = JSON.stringify(params.abi);
    }
    if (params.value) {
      payload.value = params.value;
    }

    try {
      const res = await this.client.rawRequest<Record<string, unknown>>("/execute/contract-call", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Pure view functions return { result: '...' } when called without state change
      if ("result" in res && !("wouldRevert" in res)) {
        return {
          success: true,
          status: "simulated",
          to: params.contractAddress,
          simulatedReturnValue: res.result,
          gasEstimate: "21000",
          wouldRevert: false,
        };
      }

      return res as unknown as KeeperHubSimulateResponse;
    } catch (err: unknown) {
      if (err instanceof KeeperHubError) {
        // Infrastructure, auth, and network errors (401, 403, 500+) are not on-chain simulation reverts
        if (err.status === 401 || err.status === 403 || err.status >= 500) {
          throw err;
        }
        if (err.body && typeof err.body === "object") {
          const body = err.body as Record<string, unknown>;
          return {
            success: false,
            status: "simulated",
            from: typeof body.from === "string" ? body.from : undefined,
            to: typeof body.to === "string" ? body.to : String(params.contractAddress),
            value: typeof body.value === "string" ? body.value : params.value,
            gasEstimate: "0",
            wouldRevert: true,
            failureKind: typeof body.failureKind === "string" ? body.failureKind : "revert",
            revertReason:
              typeof body.revertReason === "string"
                ? body.revertReason
                : typeof body.error === "string"
                ? body.error
                : err.message,
            error: typeof body.error === "string" ? body.error : err.message,
            code: typeof body.code === "string" ? body.code : undefined,
          };
        }
      }
      throw err;
    }
  }

  async executeContractCall(params: ContractCallParams): Promise<{ executionId: string; status: string; transactionHash?: string; transactionLink?: string }> {
    const payload: Record<string, unknown> = {
      contractAddress: params.contractAddress,
      chainId: chainIdFor(params.network),
      functionName: params.functionName,
    };

    if (params.functionArgs && params.functionArgs.length > 0) {
      payload.functionArgs = JSON.stringify(params.functionArgs);
    }
    if (params.abi && params.abi.length > 0) {
      payload.abi = JSON.stringify(params.abi);
    }
    if (params.value) {
      payload.value = params.value;
    }

    const headers: Record<string, string> = {};
    if (params.idempotencyKey) {
      headers["Idempotency-Key"] = params.idempotencyKey;
    }

    return this.client.rawRequest<{ executionId: string; status: string; transactionHash?: string; transactionLink?: string }>("/execute/contract-call", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  async simulateTransfer(params: TransferParams): Promise<KeeperHubSimulateResponse> {
    const payload: Record<string, unknown> = {
      recipientAddress: params.recipientAddress,
      amount: params.amount,
      chainId: chainIdFor(params.network),
      simulate: true,
    };
    if (params.tokenAddress) {
      payload.tokenAddress = params.tokenAddress;
    }

    try {
      const res = await this.client.rawRequest<KeeperHubSimulateResponse>("/execute/transfer", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return res;
    } catch (err: unknown) {
      if (err instanceof KeeperHubError) {
        // Infrastructure, auth, and network errors (401, 403, 500+) are not on-chain simulation reverts
        if (err.status === 401 || err.status === 403 || err.status >= 500) {
          throw err;
        }
        if (err.body && typeof err.body === "object") {
          const body = err.body as Record<string, unknown>;
          return {
            success: false,
            status: "simulated",
            from: typeof body.from === "string" ? body.from : undefined,
            to: typeof body.to === "string" ? body.to : String(params.recipientAddress),
            value: typeof body.value === "string" ? body.value : undefined,
            gasEstimate: "0",
            wouldRevert: true,
            failureKind: typeof body.failureKind === "string" ? body.failureKind : "validation",
            revertReason:
              typeof body.revertReason === "string"
                ? body.revertReason
                : typeof body.error === "string"
                ? body.error
                : err.message,
            error: typeof body.error === "string" ? body.error : err.message,
            code: typeof body.code === "string" ? body.code : undefined,
          };
        }
      }
      throw err;
    }
  }

  async executeTransfer(params: TransferParams): Promise<{ executionId: string; status: string; transactionHash?: string; transactionLink?: string }> {
    const payload: Record<string, unknown> = {
      recipientAddress: params.recipientAddress,
      amount: params.amount,
      chainId: chainIdFor(params.network),
    };
    if (params.tokenAddress) {
      payload.tokenAddress = params.tokenAddress;
    }

    const headers: Record<string, string> = {};
    if (params.idempotencyKey) {
      headers["Idempotency-Key"] = params.idempotencyKey;
    }

    return this.client.rawRequest<{ executionId: string; status: string; transactionHash?: string; transactionLink?: string }>("/execute/transfer", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  async getExecutionStatus(executionId: string): Promise<{
    executionId: string;
    status: string;
    transactionHash?: string;
    transactionLink?: string;
    gasUsedWei?: string;
    error?: string | null;
  }> {
    return this.client.rawRequest(`/execute/${executionId}/status`);
  }
}

let defaultClient: NyrvokKeeperHubClient | null = null;

export function getKeeperHubClient(): NyrvokKeeperHubClient {
  if (!defaultClient) {
    defaultClient = new NyrvokKeeperHubClient();
  }
  return defaultClient;
}
