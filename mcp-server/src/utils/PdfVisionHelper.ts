import fs from 'fs-extra';
import { ProviderRegistry } from '../providers/registry.js';

/** Ratio of page area covered by images above which vision is considered */
const IMAGE_COVERAGE_THRESHOLD = 0.05; // lower threshold to capture drawings too
/** Word count below which extracted text is considered "sparse" */
const SPARSE_TEXT_WORD_LIMIT = 250;

export function shouldUseVision(imageCoverageRatio: number, extractedText: string): boolean {
  if (imageCoverageRatio < IMAGE_COVERAGE_THRESHOLD) return false;
  const wordCount = extractedText.trim().split(/\s+/).filter(Boolean).length;
  
  // 1. Sparse text: if page has very little text (< 250 words), always trigger vision.
  if (wordCount < SPARSE_TEXT_WORD_LIMIT) return true;

  // 2. High coverage: if image coverage is substantial (e.g. >= 15%) and it's not a complete wall of text.
  if (imageCoverageRatio >= 0.15 && wordCount < 900) return true;

  // 3. Information imbalance: ratio of visual elements to text density (e.g., image coverage / text density ratio >= 0.3)
  const textDensityRatio = wordCount / 1000;
  if (textDensityRatio > 0 && (imageCoverageRatio / textDensityRatio) >= 0.3) {
    return true;
  }

  return false;
}

export function buildVisionPrompt(
  pdfBasename: string,
  pageNum: number,
  isSubBlock: boolean = false,
  pageText: string = '',
  wikiContext: string = ''
): string {
  let prompt = '';
  if (isSubBlock) {
    prompt += `You are analyzing a cropped visual region from page ${pageNum} of the PDF "${pdfBasename}".\n`;
    if (wikiContext && wikiContext.trim()) {
      prompt += `Document context (from previous pages):\n"""\n${wikiContext.slice(0, 800)}\n"""\n\n`;
    }
    if (pageText && pageText.trim()) {
      prompt += `Surrounding page text context:\n"""\n${pageText.slice(0, 800)}\n"""\n\n`;
    }
    prompt += `Describe what you see in this specific region (e.g. details of a chart, table, diagram, or formula) in detail and explain how it relates to the surrounding page and document context. Be concise (≤200 words).`;
  } else {
    prompt += `You are analyzing page ${pageNum} of the PDF "${pdfBasename}".\n`;
    if (wikiContext && wikiContext.trim()) {
      prompt += `Document context (from previous pages):\n"""\n${wikiContext.slice(0, 800)}\n"""\n\n`;
    }
    if (pageText && pageText.trim()) {
      prompt += `Surrounding page text context:\n"""\n${pageText.slice(0, 800)}\n"""\n\n`;
    }
    prompt += `Briefly describe the overall layout, visual structure, and what the charts, diagrams, or figures on this page represent. Be concise (≤200 words).`;
  }
  return prompt;
}

/**
 * Sends the page screenshot and any smaller cropped image blocks to a vision-capable LLM provider.
 * Returns a formatted description string to be merged into pageText before chunking.
 * Returns '' if no vision provider is available or the calls fail.
 */
export async function describePageVision(
  imagePath: string,
  pdfBasename: string,
  pageNum: number,
  imageBlocks: Array<{ image_path: string; rect: number[]; width_pt: number; height_pt: number }> = [],
  pageText: string = '',
  wikiContext: string = ''
): Promise<string> {
  try {
    const registry = ProviderRegistry.getInstance();
    const providers = registry.getAvailableProviders();
    // Find provider supporting vision or fall back to first
    const provider = providers.find((p: any) => p.id === 'gemini') || providers[0];
    if (!provider) return '';

    const modelId = provider.models[0]?.id;
    if (!modelId) return '';

    // Helper to call vision for a single image path with dynamically calculated maxTokens
    const callVisionModel = async (imgPath: string, promptText: string, maxTokens: number): Promise<string> => {
      try {
        if (!await fs.pathExists(imgPath)) return '';
        const imageBuffer = await fs.readFile(imgPath);
        const base64Image = imageBuffer.toString('base64');
        const dataUrl = `data:image/png;base64,${base64Image}`;

        const response = await provider.chat({
          model: modelId,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          }],
          temperature: 0.2,
          max_tokens: maxTokens,
        });

        const text = response?.choices?.[0]?.message?.content;
        return typeof text === 'string' ? text.trim() : '';
      } catch (err) {
        console.error(`[PdfVisionHelper] Individual vision call failed for ${imgPath}:`, err);
        return '';
      }
    };

    // Build the list of images to analyze: full page + up to 2 sub-blocks
    const tasks: Array<Promise<{ type: 'full' | 'block'; text: string; index?: number }>> = [];

    // 1. Full page: First pass has a larger budget (500 tokens), subsequent ones delta (300 tokens)
    const isFirstPass = !wikiContext;
    const fullPageMaxTokens = isFirstPass ? 500 : 300;
    tasks.push(
      callVisionModel(imagePath, buildVisionPrompt(pdfBasename, pageNum, false, pageText, wikiContext), fullPageMaxTokens)
        .then(text => ({ type: 'full', text }))
    );

    // 2. Sub-blocks (capped at 2): dynamic budget based on relative area of the block (100 to 200 tokens)
    const blocksToProcess = imageBlocks.slice(0, 2);
    blocksToProcess.forEach((block, idx) => {
      const blockArea = block.width_pt * block.height_pt;
      const areaRatio = blockArea / 500000;
      const blockMaxTokens = Math.min(200, Math.max(100, Math.round(areaRatio * 800)));
      tasks.push(
        callVisionModel(block.image_path, buildVisionPrompt(pdfBasename, pageNum, true, pageText, wikiContext), blockMaxTokens)
          .then(text => ({ type: 'block', text, index: idx }))
      );
    });

    const results = await Promise.all(tasks);

    // Format the results into a cohesive description
    let descriptionText = '';
    const fullPageRes = results.find(r => r.type === 'full');
    if (fullPageRes && fullPageRes.text) {
      descriptionText += `\n\n[Visual Layout & Summary — page ${pageNum}]\n${fullPageRes.text}\n`;
    }

    const blockResults = results.filter(r => r.type === 'block');
    blockResults.forEach(r => {
      if (r.text) {
        descriptionText += `\n[Figure ${r.index! + 1} details — page ${pageNum}]\n${r.text}\n`;
      }
    });

    return descriptionText;
  } catch (err) {
    console.error(`[PdfVisionHelper] describePageVision failed for page ${pageNum}:`, err);
    return '';
  }
}
