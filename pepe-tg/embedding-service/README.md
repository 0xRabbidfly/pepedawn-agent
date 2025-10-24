# CLIP Embedding Microservice

Local Python service for generating 512-dimensional CLIP embeddings for visual similarity matching.

## Quick Start

### 1. Install Dependencies
```bash
cd embedding-service
pip install -r requirements.txt
```

### 2. Start Service
```bash
python main.py
```

Service runs on `http://localhost:8001`

### 3. Verify Health
```bash
curl http://localhost:8001/health
```

Expected response:
```json
{
  "status": "healthy",
  "model_loaded": true,
  "model_name": "ViT-B-32",
  "embedding_dim": 512
}
```

## Usage

### Generate Embeddings for All Cards (One-Time)
```bash
cd ../
bun run scripts/generate-card-embeddings.js
```

This will:
- Process all ~890 cards
- Generate 512-D CLIP embeddings
- Store in pglite database
- Take ~30-60 minutes (one-time)

### Generate for Specific Card
```bash
bun run scripts/generate-card-embeddings.js FREEDOMKEK
```

## API Endpoints

### POST /embed/image
Upload image file, get embedding

**Request:**
```bash
curl -X POST http://localhost:8001/embed/image \
  -F "file=@image.jpg"
```

**Response:**
```json
{
  "embedding": [0.123, -0.456, ...],  // 512 floats
  "model": "ViT-B-32",
  "processing_time_ms": 45.2
}
```

### POST /embed/text
Get text embedding (for future features)

**Request:**
```bash
curl -X POST http://localhost:8001/embed/text \
  -H "Content-Type: application/json" \
  -d '{"text": "pepe frog meme", "prompt_template": "raw"}'
```

## Model Details

- **Model:** OpenCLIP ViT-B/32 (openai weights)
- **Embedding Size:** 512 dimensions
- **Normalized:** Yes (unit vectors for cosine similarity)
- **Device:** GPU if available, otherwise CPU

## Similarity Thresholds

- **≥0.95** = Exact match (same card)
- **0.75-0.95** = High similarity (modified version)
- **<0.75** = Low similarity (different content)

## When to Run

### Required:
- First time: Generate embeddings for all existing cards
- New cards: Automatically called by `add-new-cards.js` script

### Optional (Manual):
- To regenerate specific card embeddings
- To update embeddings after image changes

## Stopping Service

Just `Ctrl+C` in the terminal where it's running.

## Troubleshooting

**Service won't start:**
```bash
# Check if port 8001 is in use
lsof -i :8001

# Use different port
EMBEDDING_SERVICE_PORT=8002 python main.py
```

**CUDA/GPU issues:**
Service will auto-fall back to CPU. For faster processing, install PyTorch with CUDA support.

**Memory issues:**
The model uses ~2GB RAM. Close other apps if needed.

