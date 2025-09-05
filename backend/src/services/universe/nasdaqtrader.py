import os
import requests
from datetime import datetime, timezone
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

NASDAQ_TRADER_URL = "https://ftp.nasdaqtrader.com/dynamic/SymDir/nasdaqtraded.txt"

class NasdaqTraderDownloader:
    def __init__(self):
        self.data_dir = os.getenv("DATA_DIR", "./data")
        self.universe_file = os.getenv("UNIVERSE_FILE", "nasdaqtraded.txt")
        
        # Ensure data directory exists
        os.makedirs(self.data_dir, exist_ok=True)
    
    def download_file(self) -> str:
        """
        Download the nasdaqtraded.txt file from NASDAQ FTP
        Returns the file path where data was saved
        """
        file_path = os.path.join(self.data_dir, self.universe_file)
        
        try:
            response = requests.get(NASDAQ_TRADER_URL, timeout=60)
            response.raise_for_status()
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(response.text)
                
            return file_path
            
        except requests.RequestException as e:
            raise Exception(f"Failed to download NASDAQ trader file: {str(e)}")
    
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