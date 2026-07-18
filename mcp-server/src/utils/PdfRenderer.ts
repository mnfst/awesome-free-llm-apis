import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'fs-extra';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PdfRenderResult {
  text: string;
  image_path: string | null;
  total_pages: number;
}

/**
 * Renders a single PDF page to PNG and extracts its text via scripts/utils/pdf_screenshot.py.
 * Shared by resolvePdfRef (on-demand single-page lookups) and pdf-wiki.ts's bounded
 * multi-page extraction loop, so both stay in sync with the script's invocation contract.
 */
export async function renderPdfPage(absPdfPath: string, pageNum: number): Promise<PdfRenderResult | null> {
  const serverRoot = path.resolve(__dirname, '../..');
  const hasServerVenv = await fs.pathExists(path.join(serverRoot, 'venv'));
  const pythonPath = process.platform === 'win32'
    ? path.join(hasServerVenv ? serverRoot : process.cwd(), 'venv', 'Scripts', 'python.exe')
    : path.join(hasServerVenv ? serverRoot : process.cwd(), 'venv', 'bin', 'python');

  let scriptPath = path.join(serverRoot, 'scripts', 'utils', 'pdf_screenshot.py');
  if (!await fs.pathExists(scriptPath)) {
    scriptPath = path.join(serverRoot, 'scripts', 'pdf_screenshot.py');
  }
  if (!await fs.pathExists(scriptPath)) {
    scriptPath = path.join(process.cwd(), 'scripts', 'utils', 'pdf_screenshot.py');
    if (!await fs.pathExists(scriptPath)) {
      scriptPath = path.join(process.cwd(), 'scripts', 'pdf_screenshot.py');
    }
  }

  try {
    const cmd = `"${pythonPath}" "${scriptPath}" "${absPdfPath}" ${pageNum}`;
    const { stdout } = await execAsync(cmd);
    const result = JSON.parse(stdout);
    if (result.error) {
      console.error(`[renderPdfPage] Python script error: ${result.error}`);
      return null;
    }
    return {
      text: (result.text || '').trim(),
      image_path: result.image_path || null,
      total_pages: typeof result.total_pages === 'number' ? result.total_pages : 1,
    };
  } catch (err) {
    console.error(`[renderPdfPage] Failed to execute Python script for page ${pageNum}:`, err);
    return null;
  }
}
