"""
CLIP Embedding Service Core
Handles model loading and embedding generation using OpenCLIP ViT-B/32
"""

import io
import torch
import open_clip
from PIL import Image
from typing import Optional, Literal
import numpy as np


class EmbeddingService:
    """
    Manages CLIP model and generates embeddings for images and text
    
    Model: OpenCLIP ViT-B/32 (512-dimensional embeddings)
    """
    
    def __init__(self):
        self.model = None
        self.preprocess = None
        self.tokenizer = None
        self.device = None
        self.model_name = "ViT-B-32"
        self.pretrained = "laion2b_s34b_b79k"  # More reliable than 'openai'
        self.embedding_dim = 512
        
        # Load model on initialization
        self._load_model()
    
    def _load_model(self):
        """Load CLIP model and preprocessing transforms"""
        print(f"🔄 Loading CLIP model: {self.model_name} ({self.pretrained})...")
        
        try:
            # Determine device (GPU if available, otherwise CPU)
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            print(f"   Using device: {self.device}")
            
            # Load model
            self.model, _, self.preprocess = open_clip.create_model_and_transforms(
                self.model_name,
                pretrained=self.pretrained,
                device=self.device
            )
            
            # Get tokenizer
            self.tokenizer = open_clip.get_tokenizer(self.model_name)
            
            # Set model to evaluation mode
            self.model.eval()
            
            print(f"✅ CLIP model loaded successfully")
            print(f"   Embedding dimension: {self.embedding_dim}")
            
        except Exception as e:
            print(f"❌ Failed to load CLIP model: {e}")
            raise
    
    def is_loaded(self) -> bool:
        """Check if model is loaded and ready"""
        return self.model is not None
    
    def apply_prompt_template(
        self,
        text: str,
        template: Literal["visual", "content", "raw"] = "raw"
    ) -> str:
        """
        Apply prompt engineering templates to improve matching
        
        Args:
            text: User query text
            template: Template type ('visual', 'content', or 'raw')
        
        Returns:
            Processed text with template applied
        """
        if template == "visual":
            # Emphasize visual style/aesthetic
            return f"A digital art card featuring {text}, with emphasis on visual style and composition"
        
        elif template == "content":
            # Emphasize subject matter/themes
            return f"A digital art card depicting {text}, focused on the subject matter and themes"
        
        else:  # raw
            # Use text as-is
            return text
    
    def encode_text(self, text: str) -> np.ndarray:
        """
        Generate embedding for text input
        
        Args:
            text: Text string to embed
        
        Returns:
            512-dimensional embedding as numpy array
        """
        if not self.is_loaded():
            raise RuntimeError("Model not loaded")
        
        try:
            # Tokenize text
            tokens = self.tokenizer([text]).to(self.device)
            
            # Generate embedding
            with torch.no_grad():
                text_features = self.model.encode_text(tokens)
                
                # Normalize to unit vector (for cosine similarity)
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            
            # Convert to numpy array
            embedding = text_features.cpu().numpy()[0]
            
            return embedding
            
        except Exception as e:
            raise RuntimeError(f"Text encoding failed: {e}")
    
    def encode_image(self, image_bytes: bytes) -> np.ndarray:
        """
        Generate embedding for image input
        
        Args:
            image_bytes: Raw image bytes (PNG, JPG, GIF)
        
        Returns:
            512-dimensional embedding as numpy array
        """
        if not self.is_loaded():
            raise RuntimeError("Model not loaded")
        
        try:
            # Load image from bytes
            image = Image.open(io.BytesIO(image_bytes))
            
            # Convert to RGB (handles RGBA, grayscale, etc.)
            image = image.convert("RGB")
            
            # Apply preprocessing transforms
            image_tensor = self.preprocess(image).unsqueeze(0).to(self.device)
            
            # Generate embedding
            with torch.no_grad():
                image_features = self.model.encode_image(image_tensor)
                
                # Normalize to unit vector (for cosine similarity)
                image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            
            # Convert to numpy array
            embedding = image_features.cpu().numpy()[0]
            
            return embedding
            
        except Exception as e:
            raise RuntimeError(f"Image encoding failed: {e}")
    
    def encode_batch_text(self, texts: list[str]) -> list[np.ndarray]:
        """
        Generate embeddings for multiple text inputs (batch processing)
        
        Args:
            texts: List of text strings
        
        Returns:
            List of 512-dimensional embeddings
        """
        if not self.is_loaded():
            raise RuntimeError("Model not loaded")
        
        try:
            # Tokenize all texts
            tokens = self.tokenizer(texts).to(self.device)
            
            # Generate embeddings
            with torch.no_grad():
                text_features = self.model.encode_text(tokens)
                
                # Normalize each vector
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            
            # Convert to list of numpy arrays
            embeddings = [feat.cpu().numpy() for feat in text_features]
            
            return embeddings
            
        except Exception as e:
            raise RuntimeError(f"Batch text encoding failed: {e}")
    
    def validate_embedding(self, embedding: np.ndarray) -> bool:
        """
        Validate that embedding is properly normalized
        
        Args:
            embedding: Numpy array to validate
        
        Returns:
            True if valid unit vector
        """
        magnitude = np.linalg.norm(embedding)
        return abs(magnitude - 1.0) < 0.01  # Tolerance for floating point


# Create singleton instance
_embedding_service_instance = None

def get_embedding_service() -> EmbeddingService:
    """Get or create singleton embedding service instance"""
    global _embedding_service_instance
    
    if _embedding_service_instance is None:
        _embedding_service_instance = EmbeddingService()
    
    return _embedding_service_instance



