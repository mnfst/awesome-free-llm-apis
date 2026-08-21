import path from 'node:path';
import fs from 'node:fs/promises';
import { toMarkdownResponse } from '../utils/markdown.js';
import { PipelineExecutor, TaskType, type PipelineContext } from '../pipeline/middleware.js';
import { 
  getStructuralMarkdownMiddleware, 
  getSharedResponseCache, 
  getWorkspaceContextMiddleware, 
  getAgenticMiddleware, 
  getSharedImageRouter 
} from '../pipeline/instances.js';

import { renderPdfPage } from '../utils/PdfRenderer.js';

export interface VisionToolInput {
  workspace_root?: string;
  image_path: string; // file:/// absolute URI
  prompt?: string;
  model?: string;
}

export async function visionTool(input: VisionToolInput): Promise<{ response: string; model: string }> {
  const { workspace_root, image_path, prompt, model = 'gemini-3.1-flash-lite' } = input;

  if (!image_path) {
    throw new Error('vision_tool requires image_path.');
  }
  if (!image_path.startsWith('file:///')) {
    throw new Error('image_path must use file:/// scheme.');
  }

  let decodedPath = decodeURIComponent(image_path.replace(/^file:\/\//, ''));
  if (decodedPath.startsWith('/')) {
    if (/^\/[A-Za-z]:\//.test(decodedPath)) {
      decodedPath = decodedPath.substring(1);
    }
  }

  // Handle trailing :<pageNum> suffix (e.g. file:///path/to/doc.pdf:2)
  const pageMatch = decodedPath.match(/^(.*\.pdf):(\d+)$/i);
  const cleanPath = pageMatch ? pageMatch[1] : decodedPath;
  const pageNum = pageMatch ? parseInt(pageMatch[2], 10) || 1 : 1;

  const imageFsPath = path.resolve(cleanPath);

  if (workspace_root) {
    const ws = path.resolve(workspace_root);
    if (!imageFsPath.startsWith(ws)) {
      throw new Error('image_path must be inside workspace_root boundaries.');
    }
  }

  const stat = await fs.stat(imageFsPath);
  if (!stat.isFile()) {
    throw new Error('image_path does not point to a file.');
  }

  const userPrompt = prompt || 'Analyze this image and provide a concise technical markdown report.';
  const isPdf = imageFsPath.toLowerCase().endsWith('.pdf');

  let effectiveImageUrl = image_path;
  let effectivePrompt = userPrompt;
  let extractedPdfText: string | undefined;
  let pdfMetadata: any;

  if (isPdf) {
    const renderResult = await renderPdfPage(imageFsPath, pageNum);
    if (!renderResult) {
      throw new Error(`Failed to render PDF page ${pageNum} from ${imageFsPath}`);
    }

    extractedPdfText = renderResult.text;
    pdfMetadata = {
      totalPages: renderResult.total_pages,
      pageNum,
      imageCoverageRatio: renderResult.image_coverage_ratio,
      imageBlocks: renderResult.image_blocks
    };

    if (renderResult.image_path && await fs.stat(renderResult.image_path).then(() => true).catch(() => false)) {
      const pngBuffer = await fs.readFile(renderResult.image_path);
      effectiveImageUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    }

    if (extractedPdfText && extractedPdfText.trim()) {
      effectivePrompt = `${userPrompt}\n\n[Extracted Page Text (page ${pageNum}/${renderResult.total_pages})]:\n${extractedPdfText.trim()}`;
    }
  }

  // Build a dedicated vision pipeline utilizing the ImageRouterMiddleware
  const pipeline = new PipelineExecutor();
  pipeline.use(getStructuralMarkdownMiddleware());
  pipeline.use(getSharedResponseCache());
  pipeline.use(getWorkspaceContextMiddleware());
  pipeline.use(getSharedImageRouter());

  const context: PipelineContext = {
    request: {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: effectivePrompt },
            { type: 'image_url', image_url: { url: effectiveImageUrl } }
          ]
        }
      ]
    },
    taskType: TaskType.Vision,
    workspaceRoot: workspace_root,
    isOnePass: true,
    extractedPdfText,
    pdfMetadata
  };

  const finalContext = await pipeline.execute(context);
  
  if (!finalContext.response) {
    throw new Error('Pipeline completed but no response was generated.');
  }

  const content = finalContext.response?.choices?.[0]?.message?.content || '';
  return {
    response: toMarkdownResponse(typeof content === 'string' ? content : JSON.stringify(content, null, 2)),
    model: finalContext.response.model || model
  };
}
