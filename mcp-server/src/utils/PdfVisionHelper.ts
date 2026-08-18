import fs from 'fs-extra';
import { ProviderRegistry } from '../providers/registry.js';

/** Ratio of page area covered by images above which vision is considered */
const IMAGE_COVERAGE_THRESHOLD = 0.05; // lower threshold to capture drawings too
/** Word count below which extracted text is considered "sparse" */
const SPARSE_TEXT_WORD_LIMIT = 250;

/** Base Gemini timeout for a full-page vision call, extended per context weight */
const FULL_PAGE_BASE_TIMEOUT_MS = 30000;
const FULL_PAGE_MAX_TIMEOUT_MS = 50000;
/** Base Gemini timeout for a cropped sub-block vision call, extended per area weight */
const SUB_BLOCK_BASE_TIMEOUT_MS = 20000;
const SUB_BLOCK_MAX_TIMEOUT_MS = 35000;

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
  wikiContext: string = '',
  fullPageVisionOverview: string = ''
): string {
  let prompt = '';
  if (isSubBlock) {
    prompt += `You are analyzing a cropped visual region from page ${pageNum} of the PDF "${pdfBasename}".\n`;
    if (wikiContext && wikiContext.trim()) {
      prompt += `Document context (from previous pages):\n"""\n${wikiContext.slice(0, 800)}\n"""\n\n`;
    }
    if (fullPageVisionOverview && fullPageVisionOverview.trim()) {
      prompt += `Full page visual overview:\n"""\n${fullPageVisionOverview.slice(0, 800)}\n"""\n\n`;
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
 * Sends the page screenshot and any smaller cropped image blocks to a vision-capable LLM provider sequentially.
 * Passes the full page visual summary into sub-block prompts (context-weighted) and rotates across available vision providers.
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
    const visionCandidates = typeof registry.getAvailableVisionModels === 'function'
      ? registry.getAvailableVisionModels()
      : [];
    const providers = registry.getAvailableProviders();
    const defaultProvider = providers.find((p: any) => p.id === 'gemini') || providers[0];
    if (!defaultProvider && visionCandidates.length === 0) return '';

    // Helper to call vision for a single image path with fallback provider rotation and dynamically calculated maxTokens/timeoutMs
    const callVisionModel = async (imgPath: string, promptText: string, maxTokens: number, timeoutMs: number): Promise<string> => {
      try {
        if (!await fs.pathExists(imgPath)) return '';
        const imageBuffer = await fs.readFile(imgPath);
        const base64Image = imageBuffer.toString('base64');
        const dataUrl = `data:image/png;base64,${base64Image}`;

        const candidateList = visionCandidates.length > 0
          ? visionCandidates.map(c => ({ provider: c.provider, model: c.model.id }))
          : (defaultProvider ? [{ provider: defaultProvider, model: defaultProvider.models[0]?.id }] : []);

        for (const { provider, model } of candidateList) {
          if (!provider || !model) continue;
          try {
            const response = await provider.chat({
              model,
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: promptText },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              }],
              temperature: 0.2,
              max_tokens: maxTokens,
              timeoutMs,
            });

            const text = response?.choices?.[0]?.message?.content;
            if (typeof text === 'string' && text.trim()) {
              return text.trim();
            }
          } catch (err: any) {
            console.error(`[PdfVisionHelper] Vision call via ${provider.id}/${model} failed for ${imgPath}:`, err.message);
          }
        }
        return '';
      } catch (err) {
        console.error(`[PdfVisionHelper] Individual vision call failed for ${imgPath}:`, err);
        return '';
      }
    };

    // 1. Full page (Sequential pass 1): Larger budget on first pass (500 tokens), delta on subsequent (300 tokens)
    const isFirstPass = !wikiContext;
    const fullPageMaxTokens = isFirstPass ? 500 : 300;
    const fullPageTimeoutMs = Math.min(
      FULL_PAGE_MAX_TIMEOUT_MS,
      FULL_PAGE_BASE_TIMEOUT_MS + Math.min(20000, imageBlocks.length * 4000 + Math.floor((pageText.length + wikiContext.length) / 500) * 1000)
    );

    const fullPagePrompt = buildVisionPrompt(pdfBasename, pageNum, false, pageText, wikiContext);
    const fullPageText = await callVisionModel(imagePath, fullPagePrompt, fullPageMaxTokens, fullPageTimeoutMs);

    let descriptionText = '';
    if (fullPageText) {
      descriptionText += `\n\n[Visual Layout & Summary — page ${pageNum}]\n${fullPageText}\n`;
    }

    // 2. Sub-blocks (Sequential pass 2, capped at 2): dynamic budget based on area and enriched with fullPageText context
    const blocksToProcess = imageBlocks.slice(0, 2);
    for (let idx = 0; idx < blocksToProcess.length; idx++) {
      const block = blocksToProcess[idx];
      const blockArea = block.width_pt * block.height_pt;
      const areaRatio = blockArea / 500000;
      const blockMaxTokens = Math.min(200, Math.max(100, Math.round(areaRatio * 800)));
      const blockTimeoutMs = Math.min(SUB_BLOCK_MAX_TIMEOUT_MS, SUB_BLOCK_BASE_TIMEOUT_MS + Math.round(areaRatio * 15000));

      const subBlockPrompt = buildVisionPrompt(pdfBasename, pageNum, true, pageText, wikiContext, fullPageText);
      const subBlockText = await callVisionModel(block.image_path, subBlockPrompt, blockMaxTokens, blockTimeoutMs);
      if (subBlockText) {
        descriptionText += `\n[Figure ${idx + 1} details — page ${pageNum}]\n${subBlockText}\n`;
      }
    }

    return descriptionText;
  } catch (err) {
    console.error(`[PdfVisionHelper] describePageVision failed for page ${pageNum}:`, err);
    return '';
  }
}
