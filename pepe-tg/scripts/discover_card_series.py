#!/usr/bin/env python3
"""
Discover Fake Rares card series numbers by analyzing chat history.
Extracts card names mentioned with /c or /f commands.
Helps populate the CARD_SERIES_MAP for the /f command.

URL Pattern: https://pepewtf.s3.amazonaws.com/collections/fake-rares/full/{0-18}/{ASSET}.{jpg|gif}
"""

import re
import json
from pathlib import Path

def extract_cards_from_chat_history():
    """Extract all mentioned Fake Rares card names from chat history."""
    
    chunks_dir = Path("../docs/chunks")
    if not chunks_dir.exists():
        print(f"Error: {chunks_dir} not found")
        return
    
    # Common patterns for card mentions
    card_patterns = [
        r'/c\s+([A-Z0-9]+)',  # /c CARDNAME
        r'/f\s+([A-Z0-9]+)',  # /f CARDNAME
        r'\b([A-Z]{4,})\b',   # All-caps words (likely card names)
    ]
    
    cards_mentioned = {}
    
    print("Scanning chat history for Fake Rares card names...")
    
    for chunk_file in sorted(chunks_dir.glob("*.json")):
        try:
            with open(chunk_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            messages = data.get('messages', [])
            
            for msg in messages:
                text = msg.get('text', '')
                
                for pattern in card_patterns:
                    matches = re.findall(pattern, text)
                    for match in matches:
                        if len(match) >= 4:  # Filter short words
                            cards_mentioned[match] = cards_mentioned.get(match, 0) + 1
        except Exception as e:
            print(f"Error processing {chunk_file}: {e}")
    
    # Sort by mention count
    sorted_cards = sorted(cards_mentioned.items(), key=lambda x: x[1], reverse=True)
    
    print(f"\n📊 Found {len(sorted_cards)} potential card names:\n")
    print("Top 50 most mentioned:")
    print("-" * 50)
    
    for card, count in sorted_cards[:50]:
        # Filter out common words
        if card not in ['RARE', 'PEPE', 'FAKE', 'WAGMI', 'THAT', 'THIS', 'WITH', 'FROM']:
            print(f"{card:20} - mentioned {count:4} times")
    
    # Export for TypeScript
    print("\n\n📝 TypeScript mapping (add known series numbers):")
    print("=" * 50)
    print("const CARD_SERIES_MAP: Record<string, number> = {")
    
    for card, count in sorted_cards[:30]:
        if card not in ['RARE', 'PEPE', 'FAKE', 'WAGMI', 'THAT', 'THIS', 'WITH', 'FROM']:
            print(f"  '{card}': 0,  // TODO: Find series number - mentioned {count}x")
    
    print("};")

if __name__ == "__main__":
    extract_cards_from_chat_history()

