"""Bounded, local-first BGE-M3 embedding service."""

import os
from flask import Flask, jsonify, request
from sentence_transformers import SentenceTransformer

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = int(os.getenv('BGE_MAX_BODY_BYTES', '2000000'))

MODEL_ID = os.getenv('BGE_MODEL_ID', 'BAAI/bge-m3')
MAX_BATCH = int(os.getenv('BGE_MAX_BATCH', '64'))
MAX_TEXT_CHARS = int(os.getenv('BGE_MAX_TEXT_CHARS', '20000'))
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.getenv(
        'BGE_ALLOWED_ORIGINS',
        'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173',
    ).split(',')
    if origin.strip()
}

print(f'Loading embedding model {MODEL_ID}...')
model = SentenceTransformer(MODEL_ID)
print('Embedding model ready.')


@app.after_request
def security_headers(response):
    origin = request.headers.get('Origin')
    if origin in ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Vary'] = 'Origin'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


@app.route('/embed', methods=['POST', 'OPTIONS'])
def embed():
    if request.method == 'OPTIONS':
        return ('', 204)
    origin = request.headers.get('Origin')
    if origin and origin not in ALLOWED_ORIGINS:
        return jsonify({'error': 'Origin not allowed'}), 403
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or 'text' not in data:
        return jsonify({'error': 'Expected JSON object with a text field'}), 400

    texts = [data['text']] if isinstance(data['text'], str) else data['text']
    if not isinstance(texts, list) or not texts or len(texts) > MAX_BATCH:
        return jsonify({'error': f'text must contain 1 to {MAX_BATCH} strings'}), 400
    if any(not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT_CHARS for text in texts):
        return jsonify({'error': f'each text must be non-empty and at most {MAX_TEXT_CHARS} characters'}), 400

    embeddings = model.encode(texts, normalize_embeddings=True)
    return jsonify({'embeddings': embeddings.tolist(), 'model': MODEL_ID, 'normalized': True})


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model': MODEL_ID})


if __name__ == '__main__':
    bind_host = os.getenv('BGE_BIND_HOST', '127.0.0.1')
    bind_port = int(os.getenv('BGE_PORT', '5001'))
    print(f'Embedding server listening on http://{bind_host}:{bind_port}')
    app.run(host=bind_host, port=bind_port)
