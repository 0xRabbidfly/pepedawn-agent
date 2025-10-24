"""
CLIP Embedding Service
FastAPI microservice for generating image and text embeddings using OpenCLIP ViT-B/32
"""

import time
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

from models import (
    TextEmbeddingRequest,
    TextEmbeddingResponse,
    ImageEmbeddingResponse,
    BatchEmbeddingRequest,
    BatchEmbeddingResponse,
    HealthResponse,
    ErrorResponse
)
from embedding import EmbeddingService

# Initialize FastAPI app
app = FastAPI(
    title="CLIP Embedding Service",
    description="Local microservice for generating CLIP embeddings for visual and textual card search",
    version="1.0.0"
)

# Initialize embedding service (loads CLIP model)
embedding_service = EmbeddingService()

# Request counter for monitoring
request_counter = 0
last_request_time: Optional[datetime] = None


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint - returns service status and model readiness"""
    global request_counter, last_request_time
    
    model_loaded = embedding_service.is_loaded()
    
    return HealthResponse(
        status="healthy" if model_loaded else "degraded",
        model_loaded=model_loaded,
        model_name=embedding_service.model_name if model_loaded else None,
        embedding_dim=embedding_service.embedding_dim if model_loaded else None,
        last_request=last_request_time.isoformat() if last_request_time else None,
        total_requests=request_counter
    )


@app.post("/embed/text", response_model=TextEmbeddingResponse)
async def embed_text(request: TextEmbeddingRequest):
    """
    Generate text embedding from input string
    
    Applies optional prompt templates for visual/content search optimization
    """
    global request_counter, last_request_time
    
    start_time = time.time()
    
    try:
        # Apply prompt template if specified
        processed_text = embedding_service.apply_prompt_template(
            request.text,
            request.prompt_template
        )
        
        # Generate embedding
        embedding = embedding_service.encode_text(processed_text)
        
        # Update metrics
        request_counter += 1
        last_request_time = datetime.now()
        
        processing_time = (time.time() - start_time) * 1000  # Convert to ms
        
        return TextEmbeddingResponse(
            embedding=embedding.tolist(),
            model=embedding_service.model_name,
            processing_time_ms=processing_time,
            processed_text=processed_text
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Text embedding generation failed: {str(e)}"
        )


@app.post("/embed/image", response_model=ImageEmbeddingResponse)
async def embed_image(file: UploadFile = File(...)):
    """
    Generate image embedding from uploaded file
    
    Supports PNG, JPG, GIF formats
    """
    global request_counter, last_request_time
    
    start_time = time.time()
    
    # Validate file type
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Allowed: PNG, JPG, GIF"
        )
    
    try:
        # Read image file
        image_bytes = await file.read()
        
        # Generate embedding
        embedding = embedding_service.encode_image(image_bytes)
        
        # Update metrics
        request_counter += 1
        last_request_time = datetime.now()
        
        processing_time = (time.time() - start_time) * 1000  # Convert to ms
        
        return ImageEmbeddingResponse(
            embedding=embedding.tolist(),
            model=embedding_service.model_name,
            processing_time_ms=processing_time
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Image embedding generation failed: {str(e)}"
        )


@app.post("/embed/batch", response_model=BatchEmbeddingResponse)
async def embed_batch(request: BatchEmbeddingRequest):
    """
    Batch embedding endpoint for indexing pipeline
    
    Processes multiple images or texts in a single request
    """
    global request_counter, last_request_time
    
    start_time = time.time()
    
    try:
        embeddings = []
        successful = 0
        failed = 0
        
        for item in request.items:
            try:
                if request.type == "text":
                    embedding = embedding_service.encode_text(item.get("text", ""))
                    embeddings.append({
                        "id": item.get("id"),
                        "embedding": embedding.tolist(),
                        "success": True,
                        "error": None
                    })
                    successful += 1
                    
                elif request.type == "image":
                    # For batch, items should include local file paths
                    # (server-side only, not exposed via network)
                    path = item.get("path")
                    if not path:
                        raise ValueError("Missing 'path' for image batch item")
                    
                    with open(path, 'rb') as f:
                        image_bytes = f.read()
                    
                    embedding = embedding_service.encode_image(image_bytes)
                    embeddings.append({
                        "id": item.get("id"),
                        "embedding": embedding.tolist(),
                        "success": True,
                        "error": None
                    })
                    successful += 1
                    
            except Exception as e:
                embeddings.append({
                    "id": item.get("id"),
                    "embedding": None,
                    "success": False,
                    "error": str(e)
                })
                failed += 1
        
        # Update metrics
        request_counter += successful
        last_request_time = datetime.now()
        
        total_time = (time.time() - start_time) * 1000  # Convert to ms
        
        return BatchEmbeddingResponse(
            embeddings=embeddings,
            total=len(request.items),
            successful=successful,
            failed=failed,
            total_time_ms=total_time
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Batch embedding failed: {str(e)}"
        )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for unhandled errors"""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc),
            "timestamp": datetime.now().isoformat()
        }
    )


if __name__ == "__main__":
    # Run the service
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=False,  # Disable in production
        log_level="info"
    )



