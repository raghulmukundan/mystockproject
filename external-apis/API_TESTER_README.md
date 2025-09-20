# 🚀 External APIs Tester

A beautiful, intuitive web interface for testing both Schwab and Finnhub API endpoints with pre-filled sample data.

## 🌟 Features

- **Two-tab interface**: Separate tabs for Schwab and Finnhub APIs
- **Pre-filled sample data**: All forms come with realistic default values
- **Real-time testing**: Click to test endpoints and see live responses
- **Response details**: Shows HTTP status, response time, and formatted JSON
- **Collapsible sections**: Clean interface with expandable endpoint sections
- **Error handling**: Clear error messages for failed requests

## 🚀 Getting Started

### 1. Start the External APIs Service

```bash
# From the project root
docker-compose up external-apis -d
```

### 2. Access the API Tester

Open your browser and go to:
```
http://localhost:8003/tester
```

## 📚 Available Endpoints

### 🔵 Schwab API

#### 🏥 Health Check
- **Endpoint**: `GET /schwab/health`
- **Purpose**: Check if Schwab service is healthy and credentials are configured
- **Sample Response**:
```json
{
  "status": "healthy",
  "credentials_configured": true
}
```

#### 💰 Get Quote
- **Endpoint**: `GET /schwab/quotes/{symbol}`
- **Purpose**: Get real-time stock quote
- **Default Symbol**: `AAPL`
- **Sample Response**:
```json
{
  "AAPL": {
    "quote": {
      "lastPrice": 225.45,
      "change": 2.15,
      "percentChange": 0.96
    }
  }
}
```

#### 💰 Get Multiple Quotes
- **Endpoint**: `GET /schwab/quotes?symbols={symbols}`
- **Purpose**: Get quotes for multiple symbols
- **Default Symbols**: `AAPL,GOOGL,MSFT`

#### 📈 Price History
- **Endpoint**: `GET /schwab/history/{symbol}`
- **Purpose**: Get historical price data
- **Parameters**:
  - `period_type`: day, month, year, ytd
  - `period`: Number of periods
  - `frequency_type`: daily, weekly, monthly
  - `frequency`: Frequency within type

#### 📊 Daily History
- **Endpoint**: `GET /schwab/history/{symbol}/daily`
- **Purpose**: Get daily OHLCV bars for date range
- **Parameters**:
  - `start`: Start date (YYYY-MM-DD)
  - `end`: End date (YYYY-MM-DD)

#### 🔐 OAuth Status
- **Endpoint**: `GET /schwab/auth/status`
- **Purpose**: Check OAuth authentication status

### 🟠 Finnhub API

#### 🏥 Health Check
- **Endpoint**: `GET /finnhub/health`
- **Purpose**: Check if Finnhub service and API key are working

#### 💰 Get Quote
- **Endpoint**: `GET /finnhub/quote/{symbol}`
- **Purpose**: Get real-time stock quote
- **Sample Response**:
```json
{
  "c": 242.215,  // Current price
  "d": 4.335,    // Change
  "dp": 1.8223,  // Percent change
  "h": 243.16,   // High
  "l": 238.3,    // Low
  "o": 238.3,    // Open
  "pc": 237.88,  // Previous close
  "t": 1758294925 // Timestamp
}
```

#### 🏢 Company Profile
- **Endpoint**: `GET /finnhub/company/{symbol}`
- **Purpose**: Get detailed company information

#### 📊 Stock Metrics
- **Endpoint**: `GET /finnhub/metrics/{symbol}`
- **Purpose**: Get comprehensive financial metrics
- **Metric Types**: all, price, valuation, growth

#### 📰 Market News
- **Endpoint**: `GET /finnhub/news`
- **Purpose**: Get latest market news
- **Categories**: general, forex, crypto, merger

#### 📰 Company News
- **Endpoint**: `GET /finnhub/company-news/{symbol}`
- **Purpose**: Get company-specific news for date range

## 🎯 How to Use

1. **Select API Tab**: Choose between Schwab or Finnhub
2. **Expand Endpoint**: Click on any endpoint header to expand the form
3. **Modify Parameters**: Update the pre-filled values as needed
4. **Test Endpoint**: Click the "Test" button
5. **View Response**: See the formatted response with status and timing

## 🔧 Pre-filled Sample Data

The tester comes with realistic default values:

- **Symbols**: AAPL, GOOGL, MSFT
- **Dates**: Last week to today for date ranges
- **Periods**: Sensible defaults for historical data
- **Categories**: Common news categories

## ⚡ Features

### Response Information
- **HTTP Status**: Green for success (200), red for errors
- **Response Time**: Milliseconds taken for the request
- **Formatted JSON**: Pretty-printed response for easy reading

### Error Handling
- Network errors are clearly displayed
- HTTP error codes are shown with status text
- Detailed error messages help with debugging

### User Experience
- **Collapsible sections**: Keep the interface clean
- **Tabbed navigation**: Easy switching between APIs
- **Real-time testing**: Instant feedback on API calls
- **Mobile responsive**: Works on desktop and mobile

## 🛠️ Technical Details

- **Built with**: Pure HTML, CSS, and JavaScript
- **Styling**: Custom CSS with gradients and animations
- **API Calls**: Fetch API for HTTP requests
- **No dependencies**: Works without external libraries

## 🚨 Troubleshooting

### Service Not Running
If you get network errors:
```bash
# Check if service is running
curl http://localhost:8003/health

# Restart if needed
docker-compose restart external-apis
```

### API Key Issues
For Finnhub or Schwab authentication errors:
1. Check your `.env` file has the correct API keys
2. Verify the external-apis service has access to environment variables
3. Use the health check endpoints to verify configuration

### CORS Issues
The service is configured to allow all origins. If you encounter CORS issues:
1. Ensure the external-apis service is running on port 8003
2. Check the browser console for detailed error messages

## 🎨 Customization

You can modify the API tester by editing:
- `external-apis/app/static/api-tester.html`
- Add new endpoints by creating new sections in the HTML
- Modify styling in the `<style>` section
- Add new JavaScript functions for custom endpoints

## 📝 Notes

- The tester connects to `http://localhost:8003` by default
- All API calls are made client-side from the browser
- Responses are formatted for readability
- Error messages provide debugging information
- The interface automatically handles different response types

Enjoy testing your external APIs with this intuitive interface! 🚀