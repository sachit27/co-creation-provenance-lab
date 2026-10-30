/** Provider error text is untrusted and can echo an authenticated request. */
export const sanitizeProviderErrorText = (value: unknown, key: string): string => {
  let text = String(value ?? '');
  if (key) text = text.split(key).join('[redacted]');
  return text
    .replace(/(Bearer\s+)[^\s"'<>]+/gi, '$1[redacted]')
    .replace(/([?&](?:key|api_key|apikey)=)[^&\s"'<>]+/gi, '$1[redacted]');
};
