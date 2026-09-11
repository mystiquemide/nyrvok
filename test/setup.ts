import * as fs from "fs";
import * as path from "path";

try {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [key, ...valParts] = trimmed.split("=");
      const val = valParts.join("=");
      if (key && val && !process.env[key.trim()]) {
        process.env[key.trim()] = val.trim();
      }
    }
  }
} catch {
  // Ignore
}
