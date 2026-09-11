import { NextRequest } from "next/server";
import { getTelemetryPayload } from "@/lib/telemetry-store";
import { getKeeperHubClient } from "@/lib/keeperhub/client";
import { jsonResponse } from "@/lib/json";

export async function GET(_request: NextRequest) {
  try {
    const telemetry = getTelemetryPayload();

    let keeperUserInfo = null;
    try {
      if (process.env.KEEPERHUB_API_KEY) {
        const client = getKeeperHubClient();
        keeperUserInfo = await client.getUser();
        if (keeperUserInfo.walletAddress) {
          telemetry.walletAddress = keeperUserInfo.walletAddress;
        }
      }
    } catch {
      // Offline fallback
    }

    return jsonResponse({
      success: true,
      telemetry,
      keeperUser: keeperUserInfo,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load telemetry";
    return jsonResponse({ success: false, error: message }, { status: 500 });
  }
}
