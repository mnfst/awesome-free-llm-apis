import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BenchmarkLogData {
  title: string;
  timestamp: string;
  summaryMarkdown: string;
}

/**
 * Writes benchmark summary log files into mcp-server/benchmarks/logs/
 */
export async function writeBenchmarkLog(
  filename: string,
  content: string,
  logsDir?: string
): Promise<string> {
  const targetDir =
    logsDir || path.resolve(__dirname, "..", "logs");

  await fs.ensureDir(targetDir);

  const filePath = path.join(targetDir, filename);
  await fs.writeFile(filePath, content, "utf-8");

  return filePath;
}
