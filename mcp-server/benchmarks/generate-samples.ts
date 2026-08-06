import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logsDir = path.join(__dirname, 'logs');
const samplesPath = path.join(__dirname, 'SAMPLES.md');

const logFiles = [
  '01-pipeline.md',
  '02-search-router.md',
  '03-cyber-tool.md',
  '04-hermes-skills.md',
  '05-quantum-tool.md',
  '06-local-llm-patch-coach.md',
  '07-browser-snapshot-diff.md',
  '08-firebase-retry.md',
];

function generateSamples() {
  const timestamp = new Date().toISOString();
  let content = `# MCP Server Benchmark Log Aggregation (SAMPLES.md)\n\n`;
  content += `> Automatically generated from benchmark run logs on: \`${timestamp}\`\n\n`;
  content += `This document aggregates the full execution logs across all 8 core subsystem benchmarks of the MCP server.\n\n`;
  content += `---\n\n`;

  for (const file of logFiles) {
    const filePath = path.join(logsDir, file);
    if (fs.existsSync(filePath)) {
      const logContent = fs.readFileSync(filePath, 'utf-8');
      content += `## File: \`${file}\`\n\n`;
      content += logContent.trim() + '\n\n---\n\n';
    } else {
      console.warn(`Warning: Log file ${file} not found at ${filePath}`);
    }
  }

  fs.writeFileSync(samplesPath, content, 'utf-8');
  console.log(`Successfully generated ${samplesPath} from ${logFiles.length} log files.`);
}

generateSamples();
