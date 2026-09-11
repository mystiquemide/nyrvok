import { getTelemetryPayload } from "@/lib/telemetry-store";
import { getKeeperHubClient } from "@/lib/keeperhub/client";
import { jsonResponse } from "@/lib/json";

export async function GET() {
  try {
    const telemetry = getTelemetryPayload();

    let keeperUser = null;
    try {
      if (process.env.KEEPERHUB_API_KEY) {
        const client = getKeeperHubClient();
        const userInfo = await client.getUser();
        if (userInfo.walletAddress) {
          telemetry.walletAddress = userInfo.walletAddress;
        }
        keeperUser = {
          name: userInfo.name,
          walletAddress: userInfo.walletAddress,
        };
      }
    } catch {
      // Offline fallback
    }

    return jsonResponse({
      success: true,
      telemetry,
      keeperUser,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load telemetry";
    return jsonResponse({ success: false, error: message }, { status: 500 });
  }
}
