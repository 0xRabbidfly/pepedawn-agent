#!/usr/bin/env python3
"""
Fake Rares Card Series Scraper
Scrapes pepe.wtf to build a complete card-to-series mapping

Usage:
    python scripts/scrape_card_series.py

Output:
    src/data/cardSeriesMap.ts - TypeScript file with all card mappings
"""

import requests
from bs4 import BeautifulSoup
import json
import time
from pathlib import Path

def scrape_fake_rares():
    """
    Scrape all Fake Rares cards from pepe.wtf
    """
    url = "https://pepe.wtf/collection/Fake-Rares"
    
    print(f"🔍 Scraping {url}...")
    
    try:
        # Add headers to avoid being blocked
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Find all card elements (adjust selectors based on actual HTML structure)
        # This is a placeholder - you'll need to inspect the actual page
        cards = soup.find_all('div', class_='card')  # Adjust selector
        
        card_series_map = {}
        
        for card in cards:
            # Extract card name and series (adjust based on actual HTML)
            card_name = card.find('span', class_='card-name')  # Adjust
            series_num = card.find('span', class_='series')    # Adjust
            
            if card_name and series_num:
                name = card_name.text.strip().upper()
                series = int(series_num.text.strip())
                card_series_map[name] = series
        
        print(f"✅ Found {len(card_series_map)} cards")
        return card_series_map
        
    except Exception as e:
        print(f"❌ Error scraping: {e}")
        return None

def scrape_fake_rares_api():
    """
    Alternative: Try to find an API endpoint
    pepe.wtf might have a JSON API we can use
    """
    # Check if there's an API endpoint
    api_url = "https://pepe.wtf/api/collection/fake-rares"  # Hypothetical
    
    try:
        response = requests.get(api_url, timeout=30)
        if response.status_code == 200:
            data = response.json()
            # Process API data
            return data
    except:
        pass
    
    return None

def generate_manual_map():
    """
    Manual mapping based on known information:
    - Each series has exactly 50 cards
    - Series 0-18 are available
    - Total: ~950 cards
    
    This is a fallback if scraping doesn't work
    """
    print("⚠️  Using manual mapping strategy...")
    print("Note: You'll need to run the scraper manually or add cards as discovered")
    
    # Known cards from your chat history
    known_cards = {
        'KARPEPELES': 0,
        'FREEDOMKEK': 0,
        'WAGMIWORLD': 10,  # Example - needs verification
        'PEPONACID': 5,    # Example - needs verification
        'BOOTLEGGED': 8,   # Example - needs verification
        'FAKEQQ': 1,       # Example - needs verification
    }
    
    return known_cards

def write_typescript_file(card_map: dict, output_path: Path):
    """
    Generate TypeScript file with card series mapping
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Sort by series, then by name
    sorted_cards = sorted(card_map.items(), key=lambda x: (x[1], x[0]))
    
    ts_content = f"""/**
 * Fake Rares Card Series Map
 * Auto-generated from pepe.wtf
 * Last updated: {time.strftime('%Y-%m-%d %H:%M:%S')}
 * 
 * Total cards: {len(card_map)}
 * Series range: {min(card_map.values())} - {max(card_map.values())}
 */

export const CARD_SERIES_MAP: Record<string, number> = {{
"""
    
    # Group by series for readability
    current_series = -1
    for card_name, series in sorted_cards:
        if series != current_series:
            if current_series != -1:
                ts_content += "\n"
            ts_content += f"  // Series {series}\n"
            current_series = series
        
        ts_content += f"  '{card_name}': {series},\n"
    
    ts_content += """};\n
/**
 * Get series number for a card
 * Returns undefined if card not found
 */
export function getCardSeries(cardName: string): number | undefined {
  return CARD_SERIES_MAP[cardName.toUpperCase()];
}

/**
 * Check if a card exists in the collection
 */
export function isKnownCard(cardName: string): boolean {
  return cardName.toUpperCase() in CARD_SERIES_MAP;
}

/**
 * Get all cards in a specific series
 */
export function getCardsInSeries(seriesNum: number): string[] {
  return Object.entries(CARD_SERIES_MAP)
    .filter(([_, series]) => series === seriesNum)
    .map(([name, _]) => name);
}

/**
 * Get total number of known cards
 */
export const TOTAL_CARDS = {len(card_map)};

/**
 * Get series range
 */
export const SERIES_RANGE = {{ min: {min(card_map.values())}, max: {max(card_map.values())} }};
"""
    
    output_path.write_text(ts_content)
    print(f"✅ Generated {output_path}")
    print(f"   Total cards: {len(card_map)}")
    print(f"   Series range: {min(card_map.values())} - {max(card_map.values())}")

def main():
    """
    Main execution
    """
    print("🐸 Fake Rares Card Series Scraper\n")
    
    # Try API first
    print("1️⃣  Attempting API scrape...")
    card_map = scrape_fake_rares_api()
    
    if not card_map:
        print("2️⃣  Attempting HTML scrape...")
        card_map = scrape_fake_rares()
    
    if not card_map:
        print("3️⃣  Using manual fallback...")
        card_map = generate_manual_map()
    
    if card_map:
        output_path = Path(__file__).parent.parent / 'src' / 'data' / 'cardSeriesMap.ts'
        write_typescript_file(card_map, output_path)
        
        print("\n✅ Done!")
        print(f"\nNext steps:")
        print(f"1. Review {output_path}")
        print(f"2. Import in fakeRaresCard.ts:")
        print(f"   import {{ CARD_SERIES_MAP }} from '../data/cardSeriesMap';")
        print(f"3. Remove the inline CARD_SERIES_MAP constant")
        print(f"4. Enjoy instant card lookups! 🚀")
    else:
        print("\n❌ Failed to generate card map")
        print("You may need to:")
        print("1. Manually inspect https://pepe.wtf/collection/Fake-Rares")
        print("2. Look for an API endpoint")
        print("3. Update the scraper selectors")

if __name__ == "__main__":
    main()

