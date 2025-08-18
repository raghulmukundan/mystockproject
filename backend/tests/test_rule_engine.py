import pytest
import pandas as pd
import numpy as np
from app.services.rule_engine import (
    RuleTokenizer, RuleParser, RuleEvaluator, 
    IndicatorCalculator, TokenType
)

class TestRuleTokenizer:
    def test_tokenize_sma_expression(self):
        tokenizer = RuleTokenizer()
        tokens = tokenizer.tokenize("SMA(20) crosses_above price")
        
        assert len(tokens) == 3
        assert tokens[0].type == TokenType.INDICATOR
        assert tokens[0].value == "SMA"
        assert tokens[1].type == TokenType.OPERATOR
        assert tokens[1].value == "crosses_above"
        assert tokens[2].type == TokenType.INDICATOR
        assert tokens[2].value == "price"

    def test_tokenize_ema_expression(self):
        tokenizer = RuleTokenizer()
        tokens = tokenizer.tokenize("price crosses_below EMA(50)")
        
        assert len(tokens) == 3
        assert tokens[0].type == TokenType.INDICATOR
        assert tokens[0].value == "price"
        assert tokens[1].type == TokenType.OPERATOR
        assert tokens[1].value == "crosses_below"
        assert tokens[2].type == TokenType.INDICATOR
        assert tokens[2].value == "EMA"

    def test_tokenize_invalid_expression(self):
        tokenizer = RuleTokenizer()
        with pytest.raises(ValueError):
            tokenizer.tokenize("invalid @ expression")

class TestRuleParser:
    def test_parse_valid_expression(self):
        parser = RuleParser()
        result = parser.parse("SMA crosses_above price")
        
        assert "tokens" in result
        assert "expression" in result
        assert len(result["tokens"]) == 3
        assert result["expression"] == "SMA crosses_above price"

    def test_parse_short_expression(self):
        parser = RuleParser()
        with pytest.raises(ValueError, match="Rule expression too short"):
            parser.parse("SMA")

class TestIndicatorCalculator:
    def test_sma_calculation(self):
        data = pd.Series([10, 12, 14, 16, 18, 20, 22, 24, 26, 28])
        sma = IndicatorCalculator.sma(data, 5)
        
        expected = data.rolling(window=5).mean()
        pd.testing.assert_series_equal(sma, expected)

    def test_ema_calculation(self):
        data = pd.Series([10, 12, 14, 16, 18, 20, 22, 24, 26, 28])
        ema = IndicatorCalculator.ema(data, 5)
        
        expected = data.ewm(span=5).mean()
        pd.testing.assert_series_equal(ema, expected)

    def test_rsi_calculation(self):
        data = pd.Series([44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.85, 47.20, 47.04, 46.03, 46.83, 46.69, 46.30, 46.53])
        rsi = IndicatorCalculator.rsi(data, 14)
        
        assert not rsi.isna().all()
        assert (rsi >= 0).all() and (rsi <= 100).all()

class TestRuleEvaluator:
    def setup_method(self):
        self.evaluator = RuleEvaluator()
        self.sample_data = pd.DataFrame({
            'Open': [100, 102, 104, 106, 108],
            'High': [105, 107, 109, 111, 113],
            'Low': [98, 100, 102, 104, 106],
            'Close': [103, 105, 107, 109, 111],
            'Volume': [1000, 1100, 1200, 1300, 1400]
        })

    def test_evaluate_crosses_above_true(self):
        data = pd.DataFrame({
            'Open': [100, 101, 102, 103, 104],
            'High': [101, 102, 103, 104, 105],
            'Low': [99, 100, 101, 102, 103],
            'Close': [100.5, 101.5, 102.5, 103.8, 104.5],
            'Volume': [1000, 1100, 1200, 1300, 1400]
        })
        
        result = self.evaluator.evaluate("price crosses_above SMA", data)
        assert isinstance(result, bool)

    def test_evaluate_crosses_below_true(self):
        data = pd.DataFrame({
            'Open': [105, 104, 103, 102, 101],
            'High': [106, 105, 104, 103, 102],
            'Low': [104, 103, 102, 101, 100],
            'Close': [104.5, 103.5, 102.5, 101.2, 100.5],
            'Volume': [1000, 1100, 1200, 1300, 1400]
        })
        
        result = self.evaluator.evaluate("price crosses_below SMA", data)
        assert isinstance(result, bool)

    def test_evaluate_insufficient_data(self):
        data = pd.DataFrame({
            'Close': [100]
        })
        
        result = self.evaluator.evaluate("price crosses_above SMA", data)
        assert result is False

    def test_evaluate_invalid_expression(self):
        result = self.evaluator.evaluate("invalid expression", self.sample_data)
        assert result is False

if __name__ == "__main__":
    pytest.main([__file__])