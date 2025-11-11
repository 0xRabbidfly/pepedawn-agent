#!/usr/bin/env python3
"""
Split large Telegram export JSON into smaller, cleaned chunks.
Extracts only: from, from_id, text, date
Filters out service messages and empty text.
"""

import json
import sys
from pathlib import Path
from datetime import datetime

# Configuration
INPUT_FILE = "result.json"
OUTPUT_DIR = "pepe-tg/docs/chunks"
MESSAGES_PER_CHUNK = 500  # Smaller chunks to avoid rate limits
FIELDS_TO_KEEP = ["from", "from_id", "text", "date"]

def clean_message(msg):
    """Extract only the fields we want to keep."""
    cleaned = {}
    
    # Skip service messages
    if msg.get("type") == "service":
        return None
    
    # Extract fields
    for field in FIELDS_TO_KEEP:
        if field in msg:
            value = msg[field]
            
            # Handle text field - can be string or array
            if field == "text":
                if isinstance(value, list):
                    # Join text parts
                    text_parts = []
                    for part in value:
                        if isinstance(part, str):
                            text_parts.append(part)
                        elif isinstance(part, dict) and "text" in part:
                            text_parts.append(part["text"])
                    value = "".join(text_parts)
                
                # Skip messages with no text
                if not value or not value.strip():
                    return None
            
            cleaned[field] = value
    
    # Only return if we have text
    if "text" in cleaned and cleaned["text"]:
        return cleaned
    
    return None

def split_messages(input_file, output_dir, chunk_size):
    """Split messages into chunks and save to separate files."""
    print(f"Reading {input_file}...")
    
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading file: {e}")
        return
    
    messages = data.get("messages", [])
    total_messages = len(messages)
    print(f"Total messages in export: {total_messages:,}")
    
    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Process messages
    cleaned_messages = []
    skipped_service = 0
    skipped_no_text = 0
    
    print("Cleaning messages...")
    for i, msg in enumerate(messages):
        if i % 100000 == 0 and i > 0:
            print(f"  Processed {i:,}/{total_messages:,} messages...")
        
        if msg.get("type") == "service":
            skipped_service += 1
            continue
        
        cleaned = clean_message(msg)
        if cleaned:
            cleaned_messages.append(cleaned)
        else:
            skipped_no_text += 1
    
    total_cleaned = len(cleaned_messages)
    print(f"\nCleaning complete:")
    print(f"  - Kept: {total_cleaned:,} messages")
    print(f"  - Skipped service messages: {skipped_service:,}")
    print(f"  - Skipped empty/no text: {skipped_no_text:,}")
    print(f"  - Reduction: {(1 - total_cleaned/total_messages)*100:.1f}%")
    
    # Split into chunks
    num_chunks = (total_cleaned + chunk_size - 1) // chunk_size
    print(f"\nSplitting into {num_chunks} chunks of ~{chunk_size:,} messages each...")
    
    for i in range(num_chunks):
        start_idx = i * chunk_size
        end_idx = min((i + 1) * chunk_size, total_cleaned)
        chunk = cleaned_messages[start_idx:end_idx]
        
        # Create chunk metadata
        chunk_data = {
            "chat_name": data.get("name", "Unknown"),
            "chat_type": data.get("type", "unknown"),
            "chat_id": data.get("id"),
            "chunk_number": i + 1,
            "total_chunks": num_chunks,
            "messages_in_chunk": len(chunk),
            "message_range": {
                "start": start_idx + 1,
                "end": end_idx
            },
            "messages": chunk
        }
        
        # Save chunk
        output_file = output_path / f"messages_chunk_{i+1:04d}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(chunk_data, f, ensure_ascii=False, indent=2)
        
        print(f"  Created {output_file.name} ({len(chunk):,} messages)")
    
    # Calculate size reduction
    original_size = Path(input_file).stat().st_size
    total_output_size = sum(f.stat().st_size for f in output_path.glob("*.json"))
    
    print(f"\nSize comparison:")
    print(f"  - Original: {original_size / (1024*1024):.1f} MB")
    print(f"  - Cleaned chunks: {total_output_size / (1024*1024):.1f} MB")
    print(f"  - Savings: {(1 - total_output_size/original_size)*100:.1f}%")
    print(f"\nDone! Output files in: {output_dir}")

if __name__ == "__main__":
    split_messages(INPUT_FILE, OUTPUT_DIR, MESSAGES_PER_CHUNK)

