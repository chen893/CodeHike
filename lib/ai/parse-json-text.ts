/**
 * Extract and validate a JSON object from a model's text response.
 *
 * Used as a fallback when the provider doesn't support structured output
 * (e.g. DeepSeek via json_object mode, or openai-compatible providers).
 *
 * Strategy:
 * 1. Try parsing the full text as JSON
 * 2. Retry after removing closed <think>...</think> reasoning tags
 * 3. Extract JSON from markdown code fences (```json ... ```)
 * 4. Find the outermost `{...}` block
 * 5. Validate against the Zod schema
 */
export function parseJsonFromText<T>(
  text: string,
  schema: import('zod').ZodSchema<T>,
  label: string,
): T {
  const rawCandidates: string[] = [];
  const textsToScan = [
    text,
    text.replace(/<think>[\s\S]*?<\/think>/g, ''),
  ];

  for (const candidateText of textsToScan) {
    // 1. Full text as-is
    rawCandidates.push(candidateText.trim());

    // 2. Extract from markdown code fences
    const fenceMatch = candidateText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) rawCandidates.push(fenceMatch[1].trim());

    // 3. Find outermost { ... }
    const braceStart = candidateText.indexOf('{');
    const braceEnd = candidateText.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      rawCandidates.push(candidateText.slice(braceStart, braceEnd + 1));
    }
  }

  let lastError: unknown = null;
  for (const candidate of rawCandidates) {
    if (!candidate.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(candidate);
      return schema.parse(parsed);
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  throw new Error(
    `[${label}] Failed to parse JSON from model response. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}\n` +
    `Raw text (first 500 chars): ${text.slice(0, 500)}`,
  );
}
