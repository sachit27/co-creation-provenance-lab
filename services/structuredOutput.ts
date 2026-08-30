/**
 * Parse a model-produced list without weakening item-level validation.
 *
 * Providers and local models sometimes return the requested wrapper object as
 * a bare JSON array, or surround otherwise valid JSON with a Markdown fence.
 * Accept those envelope variations while leaving every record to the caller's
 * allowlist, type, range, and verbatim-evidence checks.
 */
export const parseStructuredArray = (response: string, key: string): unknown[] | null => {
  const trimmed = response
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const candidates = [trimmed];
  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  }
  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        const value = (parsed as Record<string, unknown>)[key];
        if (Array.isArray(value)) return value;
        // A syntactically valid object with the wrong schema must not be
        // reinterpreted by extracting one of its unrelated nested arrays.
        return null;
      }
    } catch {
      // Try the next bounded JSON candidate. Invalid output remains null.
    }
  }
  return null;
};
