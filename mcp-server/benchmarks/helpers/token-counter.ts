import { getEncoding } from "js-tiktoken";

let encoder: ReturnType<typeof getEncoding> | null = null;

function getEncoder() {
  if (!encoder) {
    encoder = getEncoding("cl100k_base");
  }
  return encoder;
}

/**
 * Counts tokens in a given text using cl100k_base encoding.
 */
export function countTokens(text: string): number {
  if (!text) return 0;
  return getEncoder().encode(text).length;
}
