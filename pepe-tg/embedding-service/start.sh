#!/bin/bash
# Start CLIP Embedding Service

echo "🚀 Starting CLIP Embedding Service..."
echo ""

# Check if dependencies are installed
if ! python -c "import fastapi" 2>/dev/null; then
    echo "❌ Dependencies not installed!"
    echo "   Run: pip install -r requirements.txt"
    exit 1
fi

# Start service
echo "📦 Loading CLIP model and starting FastAPI server..."
echo "   Service will be available at: http://localhost:8001"
echo "   Health check: curl http://localhost:8001/health"
echo ""

python main.py

