// Service for interacting with local Ollama instance.
// In development the Vite proxy rewrites /api/ollama → http://localhost:11434
// so the browser never makes a cross-origin request (which Ollama blocks by default).
const OLLAMA_HOST = '/api/ollama';

export const checkOllamaConnection = async (): Promise<boolean> => {
  try {
    // We try to fetch tags to see if the server is responsive and we have access
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    return response.ok;
  } catch (e) {
    console.warn("Ollama connection check failed. Ensure `ollama serve` is running and `OLLAMA_ORIGINS=\"*\"` is set if using from a browser.");
    return false;
  }
};

export const getOllamaModels = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.models?.map((m: any) => m.name) || [];
  } catch (e) {
    console.warn("Failed to fetch Ollama models", e);
    return [];
  }
};

export const generateOllamaEmbedding = async (text: string, model: string): Promise<number[]> => {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model, 
        prompt: text
      })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama Embedding Failed: ${errText}`);
    }
    const data = await response.json();
    return data.embedding;
  } catch (e) {
    console.error("Ollama Embedding Error:", e);
    throw e;
  }
};

export const generateOllamaCompletion = async (
  prompt: string, 
  systemInstruction: string,
  model: string
): Promise<string> => {
  try {
    // Using the generate endpoint. 
    // Note: 'system' parameter is supported in recent Ollama versions or via modelfile, 
    // but sending it as part of prompt or 'system' field depends on model.
    // We will use the 'system' field in the JSON body which is standard for Ollama API.
    
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        system: systemInstruction,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
        }
      })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama Generation Failed: ${errText}`);
    }
    const data = await response.json();
    return data.response;
  } catch (e) {
    console.error("Ollama Completion Error:", e);
    throw e;
  }
};
