"""
BGE-M3 Embedding Server for Co-Creation Provenance Lab

Setup:
    pip install sentence-transformers flask flask-cors

Run:
    python embedding_server.py

The tool auto-detects this server at http://localhost:5001
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from sentence_transformers import SentenceTransformer

app = Flask(__name__)
CORS(app)

print("Loading BGE-M3 model (first run downloads ~2GB)...")
model = SentenceTransformer('BAAI/bge-m3')
print("Model loaded and ready!")


@app.route('/embed', methods=['POST'])
def embed():
    data = request.json
    text = data.get('text', '')

    if isinstance(text, str):
        text = [text]

    embeddings = model.encode(text, normalize_embeddings=True)

    return jsonify({
        'embeddings': embeddings.tolist()
    })


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model': 'BAAI/bge-m3'})


if __name__ == '__main__':
    print("\nEmbedding server running at http://localhost:5001")
    print("The Co-Creation Provenance Lab will auto-detect this server.\n")
    app.run(host='0.0.0.0', port=5001)
