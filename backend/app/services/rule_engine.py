import re
import pandas as pd
from typing import Dict, List, Any
from enum import Enum

class TokenType(Enum):
    INDICATOR = "INDICATOR"
    OPERATOR = "OPERATOR"
    NUMBER = "NUMBER"
    COMPARISON = "COMPARISON"
    PERIOD = "PERIOD"

class Token:
    def __init__(self, type: TokenType, value: str, position: int):
        self.type = type
        self.value = value
        self.position = position

class RuleTokenizer:
    def __init__(self):
        self.patterns = [
            (TokenType.INDICATOR, r'\b(SMA|EMA|RSI|MACD|price|volume)\b'),
            (TokenType.OPERATOR, r'\b(crosses_above|crosses_below|above|below)\b'),
            (TokenType.COMPARISON, r'[><=!]+'),
            (TokenType.NUMBER, r'\d+\.?\d*'),
            (TokenType.PERIOD, r'\(\d+\)'),
        ]

    def tokenize(self, expression: str) -> List[Token]:
        tokens = []
        position = 0
        
        while position < len(expression):
            matched = False
            
            if expression[position].isspace():
                position += 1
                continue
                
            for token_type, pattern in self.patterns:
                regex = re.compile(pattern)
                match = regex.match(expression, position)
                
                if match:
                    value = match.group(0)
                    tokens.append(Token(token_type, value, position))
                    position = match.end()
                    matched = True
                    break
            
            if not matched:
                raise ValueError(f"Invalid character at position {position}: {expression[position]}")
        
        return tokens

class RuleParser:
    def __init__(self):
        self.tokenizer = RuleTokenizer()

    def parse(self, expression: str) -> Dict[str, Any]:
        tokens = self.tokenizer.tokenize(expression)
        
        if len(tokens) < 3:
            raise ValueError("Rule expression too short")
        
        return {
            "tokens": [{"type": t.type.value, "value": t.value, "position": t.position} for t in tokens],
            "expression": expression
        }

class IndicatorCalculator:
    @staticmethod
    def sma(data: pd.Series, period: int) -> pd.Series:
        return data.rolling(window=period).mean()
    
    @staticmethod
    def ema(data: pd.Series, period: int) -> pd.Series:
        return data.ewm(span=period).mean()
    
    @staticmethod
    def rsi(data: pd.Series, period: int = 14) -> pd.Series:
        delta = data.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        return 100 - (100 / (1 + rs))

class RuleEvaluator:
    def __init__(self):
        self.parser = RuleParser()
        self.calculator = IndicatorCalculator()

    def evaluate(self, expression: str, price_data: pd.DataFrame) -> bool:
        try:
            parsed = self.parser.parse(expression)
            tokens = parsed["tokens"]
            
            if "crosses_above" in expression:
                return self._evaluate_cross_above(tokens, price_data)
            elif "crosses_below" in expression:
                return self._evaluate_cross_below(tokens, price_data)
            else:
                return self._evaluate_comparison(tokens, price_data)
                
        except Exception as e:
            print(f"Error evaluating rule: {e}")
            return False

    def _evaluate_cross_above(self, tokens: List[Dict], price_data: pd.DataFrame) -> bool:
        if len(price_data) < 2:
            return False
            
        current_price = price_data['Close'].iloc[-1]
        prev_price = price_data['Close'].iloc[-2]
        
        indicator_value_current = self._calculate_indicator(tokens[0], price_data, -1)
        indicator_value_prev = self._calculate_indicator(tokens[0], price_data, -2)
        
        if indicator_value_current is None or indicator_value_prev is None:
            return False
            
        return (prev_price <= indicator_value_prev and 
                current_price > indicator_value_current)

    def _evaluate_cross_below(self, tokens: List[Dict], price_data: pd.DataFrame) -> bool:
        if len(price_data) < 2:
            return False
            
        current_price = price_data['Close'].iloc[-1]
        prev_price = price_data['Close'].iloc[-2]
        
        indicator_value_current = self._calculate_indicator(tokens[0], price_data, -1)
        indicator_value_prev = self._calculate_indicator(tokens[0], price_data, -2)
        
        if indicator_value_current is None or indicator_value_prev is None:
            return False
            
        return (prev_price >= indicator_value_prev and 
                current_price < indicator_value_current)

    def _evaluate_comparison(self, tokens: List[Dict], price_data: pd.DataFrame) -> bool:
        return False

    def _calculate_indicator(self, token: Dict, price_data: pd.DataFrame, index: int) -> float:
        indicator = token["value"]
        
        if indicator == "SMA":
            period = self._extract_period_from_expression(token, 20)
            sma_values = self.calculator.sma(price_data['Close'], period)
            return sma_values.iloc[index] if len(sma_values) > abs(index) else None
            
        elif indicator == "EMA":
            period = self._extract_period_from_expression(token, 20)
            ema_values = self.calculator.ema(price_data['Close'], period)
            return ema_values.iloc[index] if len(ema_values) > abs(index) else None
            
        return None

    def _extract_period_from_expression(self, token: Dict, default: int = 20) -> int:
        return default

rule_evaluator = RuleEvaluator()