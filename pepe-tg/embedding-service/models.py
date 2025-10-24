"""
Pydantic Models for CLIP Embedding Service API
Defines request/response schemas for all endpoints
"""

from typing import List, Optional, Literal
from pydantic import BaseModel, Field


# =============================================================================
# REQUEST MODELS
# =============================================================================

class TextEmbeddingRequest(BaseModel):
    """Request schema for /embed/text endpoint"""
    text: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Text to embed (user query or card description)"
    )
    prompt_template: Literal["visual", "content", "raw"] = Field(
        default="raw",
        description="Prompt template: 'visual' for style emphasis, 'content' for theme emphasis, 'raw' for as-is"
    )


class BatchItem(BaseModel):
    """Single item in batch embedding request"""
    text: Optional[str] = None
    path: Optional[str] = None  # For image paths (server-side only)
    id: Optional[str] = None  # Optional identifier for tracking


class BatchEmbeddingRequest(BaseModel):
    """Request schema for /embed/batch endpoint"""
    type: Literal["image", "text"] = Field(
        ...,
        description="Type of items to embed"
    )
    items: List[BatchItem] = Field(
        ...,
        max_items=100,
        description="List of items to embed (max 100 per batch)"
    )


# =============================================================================
# RESPONSE MODELS
# =============================================================================

class TextEmbeddingResponse(BaseModel):
    """Response schema for /embed/text endpoint"""
    embedding: List[float] = Field(
        ...,
        min_items=512,
        max_items=512,
        description="512-dimensional CLIP embedding vector"
    )
    model: str = Field(
        ...,
        description="Model name used for embedding"
    )
    processing_time_ms: float = Field(
        ...,
        description="Processing time in milliseconds"
    )
    processed_text: str = Field(
        ...,
        description="Text after prompt template application (if any)"
    )


class ImageEmbeddingResponse(BaseModel):
    """Response schema for /embed/image endpoint"""
    embedding: List[float] = Field(
        ...,
        min_items=512,
        max_items=512,
        description="512-dimensional CLIP embedding vector"
    )
    model: str = Field(
        ...,
        description="Model name used for embedding"
    )
    processing_time_ms: float = Field(
        ...,
        description="Processing time in milliseconds"
    )


class BatchEmbeddingItem(BaseModel):
    """Single embedding result in batch response"""
    id: Optional[str] = None
    embedding: Optional[List[float]] = None
    success: bool
    error: Optional[str] = None


class BatchEmbeddingResponse(BaseModel):
    """Response schema for /embed/batch endpoint"""
    embeddings: List[BatchEmbeddingItem]
    total: int = Field(..., description="Total items in batch")
    successful: int = Field(..., description="Successfully processed items")
    failed: int = Field(..., description="Failed items")
    total_time_ms: float = Field(..., description="Total processing time in milliseconds")


class HealthResponse(BaseModel):
    """Response schema for /health endpoint"""
    status: Literal["healthy", "degraded"] = Field(
        ...,
        description="Service status"
    )
    model_loaded: bool = Field(
        ...,
        description="Whether CLIP model is loaded and ready"
    )
    model_name: Optional[str] = Field(
        None,
        description="Name of the loaded model"
    )
    embedding_dim: Optional[int] = Field(
        None,
        description="Dimensionality of embeddings"
    )
    last_request: Optional[str] = Field(
        None,
        description="ISO timestamp of last request"
    )
    total_requests: int = Field(
        ...,
        description="Total requests processed since startup"
    )


class ErrorResponse(BaseModel):
    """Error response schema"""
    error: str = Field(
        ...,
        description="Error message"
    )
    detail: Optional[str] = Field(
        None,
        description="Detailed error information"
    )
    timestamp: str = Field(
        ...,
        description="ISO timestamp of error"
    )



