/**
 * Minimal structural types used by the serverless handlers. Vercel supplies
 * the runtime request/response objects; keeping a large runtime package solely
 * for these annotations pulled vulnerable development-only dependencies into
 * the repository.
 */
export interface VercelRequest {
  method?: string;
  /** Handlers in this project consume normalized single-value headers only. */
  headers: Record<string, string | undefined>;
  // Serverless request bodies are validated by each handler before use.
  body?: any;
}

export interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  send(body: unknown): VercelResponse;
  setHeader(name: string, value: string | number | readonly string[]): VercelResponse;
  end(): VercelResponse;
}
