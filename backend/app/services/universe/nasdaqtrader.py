import os
import requests
from datetime import datetime, timezone
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

NASDAQ_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt"
OTHER_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt"

class NasdaqTraderDownloader:
    def __init__(self):
        self.data_dir = os.getenv("DATA_DIR", "./data")
        self.universe_file = os.getenv("UNIVERSE_FILE", "nasdaqtraded.txt")
        
        # Ensure data directory exists
        os.makedirs(self.data_dir, exist_ok=True)
    
    def download_file(self) -> str:
        """
        Download both nasdaqlisted.txt and otherlisted.txt files from NASDAQ
        Combines them into a single unified file
        Returns the file path where combined data was saved
        """
        file_path = os.path.join(self.data_dir, self.universe_file)
        
        try:
            print("Downloading NASDAQ listed securities...")
            nasdaq_response = requests.get(NASDAQ_LISTED_URL, timeout=60)
            nasdaq_response.raise_for_status()
            
            print("Downloading Other listed securities...")
            other_response = requests.get(OTHER_LISTED_URL, timeout=60)
            other_response.raise_for_status()
            
            # Parse and combine the data
            nasdaq_lines = nasdaq_response.text.strip().split('\n')
            other_lines = other_response.text.strip().split('\n')
            
            # Combined data with unified header
            combined_lines = []
            
            # Add unified header (based on nasdaqlisted format but compatible with both)
            combined_lines.append("Symbol|Security Name|Listing Exchange|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares")
            
            # Process NASDAQ listed securities (skip header, skip footer)
            for line in nasdaq_lines[1:]:
                if line.strip() and not line.startswith("File Creation Time"):
                    parts = line.split('|')
                    if len(parts) >= 4:  # Basic validation
                        # NASDAQ format: Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|NextShares
                        symbol = parts[0].strip()
                        security_name = parts[1].strip()
                        market_category = parts[2].strip()
                        test_issue = parts[3].strip() if len(parts) > 3 else 'N'
                        financial_status = parts[4].strip() if len(parts) > 4 else 'N'
                        round_lot_size = parts[5].strip() if len(parts) > 5 else '100'
                        nextshares = parts[6].strip() if len(parts) > 6 else 'N'
                        
                        # Unified format: Symbol|Security Name|Listing Exchange|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
                        unified_line = f"{symbol}|{security_name}|Q|{market_category}|{test_issue}|{financial_status}|{round_lot_size}|N|{nextshares}"
                        combined_lines.append(unified_line)
            
            # Process Other listed securities (skip header, skip footer)  
            for line in other_lines[1:]:
                if line.strip() and not line.startswith("File Creation Time"):
                    parts = line.split('|')
                    if len(parts) >= 2:  # Basic validation
                        # Other format: ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
                        symbol = parts[0].strip()
                        security_name = parts[1].strip()
                        exchange = parts[2].strip() if len(parts) > 2 else 'A'
                        etf = parts[4].strip() if len(parts) > 4 else 'N'
                        round_lot_size = parts[5].strip() if len(parts) > 5 else '100'
                        test_issue = parts[6].strip() if len(parts) > 6 else 'N'
                        
                        # Unified format: Symbol|Security Name|Listing Exchange|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
                        unified_line = f"{symbol}|{security_name}|{exchange}| |{test_issue}| |{round_lot_size}|{etf}|N"
                        combined_lines.append(unified_line)
            
            # Add footer
            from datetime import datetime
            current_time = datetime.now().strftime("%m%d%Y%H:%M")
            combined_lines.append(f"File Creation Time: {current_time}|||||||")
            
            # Write combined data to file
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(combined_lines))
            
            print(f"Successfully combined {len(nasdaq_lines)-2} NASDAQ + {len(other_lines)-2} other listings")
            return file_path
            
        except requests.RequestException as e:
            raise Exception(f"Failed to download NASDAQ files: {str(e)}")
        except Exception as e:
            raise Exception(f"Failed to process NASDAQ data: {str(e)}")
    
    def parse_file(self, file_path: Optional[str] = None) -> List[Dict]:
        """
        Parse the nasdaqtraded.txt file and return list of symbol dictionaries
        """
        if file_path is None:
            file_path = os.path.join(self.data_dir, self.universe_file)
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"NASDAQ trader file not found: {file_path}")
        
        symbols = []
        
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        if len(lines) < 2:
            raise ValueError("Invalid file format: insufficient lines")
        
        # Skip header row (first line)
        # Skip footer "File Creation Time" line (last line)
        data_lines = lines[1:-1] if len(lines) > 2 else lines[1:]
        
        for line_num, line in enumerate(data_lines, start=2):
            line = line.strip()
            
            # Skip empty lines
            if not line:
                continue
                
            # Skip the footer line if it contains "File Creation Time"
            if "File Creation Time" in line:
                continue
            
            parts = line.split('|')
            
            if len(parts) < 9:
                print(f"Warning: Skipping line {line_num} - insufficient fields: {line}")
                continue
            
            try:
                # Extract and clean fields
                symbol = parts[0].strip().upper()
                security_name = parts[1].strip()
                listing_exchange = parts[2].strip()
                market_category = parts[3].strip()
                test_issue = parts[4].strip()
                financial_status = parts[5].strip()
                round_lot_size_str = parts[6].strip()
                etf = parts[7].strip()
                nextshares = parts[8].strip() if len(parts) > 8 else ""
                
                # Convert round_lot_size to integer
                try:
                    round_lot_size = int(round_lot_size_str) if round_lot_size_str else None
                except ValueError:
                    round_lot_size = None
                
                # Generate stooq_symbol: symbol.upper().replace('.', '-').lower() + '.us'
                stooq_symbol = symbol.replace('.', '-').lower() + '.us'
                
                # Current UTC timestamp
                updated_at = datetime.now(timezone.utc).isoformat()
                
                symbol_data = {
                    'symbol': symbol,
                    'security_name': security_name,
                    'listing_exchange': listing_exchange,
                    'market_category': market_category,
                    'test_issue': test_issue,
                    'financial_status': financial_status,
                    'round_lot_size': round_lot_size,
                    'etf': etf,
                    'nextshares': nextshares,
                    'stooq_symbol': stooq_symbol,
                    'updated_at': updated_at
                }
                
                symbols.append(symbol_data)
                
            except Exception as e:
                print(f"Warning: Error processing line {line_num}: {e}")
                continue
        
        return symbols
    
    def download_and_parse(self) -> List[Dict]:
        """
        Download and parse the NASDAQ trader file in one operation
        """
        file_path = self.download_file()
        return self.parse_file(file_path)