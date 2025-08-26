# Setting Up Your Finnhub API Key

This application requires a valid Finnhub API key to retrieve stock data. Follow these steps to set up your API key:

## 1. Get a Finnhub API Key

1. Visit [Finnhub.io](https://finnhub.io/) and sign up for a free account
2. Once registered and logged in, navigate to your Dashboard
3. Copy your API key from the dashboard

## 2. Configure the API Key in the Application

### Option A: Using .env file (Recommended)

1. In the `backend` directory, create a file named `.env` if it doesn't already exist
2. Add your Finnhub API key to the file:
   ```
   FINNHUB_API_KEY=your_actual_api_key_here
   ```
3. Replace `your_actual_api_key_here` with your actual Finnhub API key
4. Save the file

### Option B: Using Command Line Arguments

When running the test scripts, you can provide your API key as a command line argument:

```bash
# Test 52-week high/low data
cd backend
python test_52week.py YOUR_API_KEY AAPL

# Test multiple symbols
cd backend
python test_multiple_symbols.py YOUR_API_KEY
```

## 3. Verify Your API Key

To verify that your API key is working correctly, run the test script:

```bash
cd backend
python test_finnhub.py
```

If your API key is valid, you should see successful API responses with stock data.

## Troubleshooting

### Common Issues:

1. **401 Unauthorized Error**: This usually means your API key is invalid or has expired. Double-check the key on your Finnhub dashboard.

2. **429 Too Many Requests**: The free tier of Finnhub has a rate limit of 60 API calls per minute. If you exceed this limit, you'll need to wait before making more requests.

3. **Key Not Found**: Make sure your `.env` file is in the correct location (in the `backend` directory) and has the correct format.

4. **No Stock Data**: Some stock symbols may not have complete data available in the Finnhub API, especially for the 52-week high/low metrics.

### Getting Help

If you continue to experience issues, please:

1. Check the logs in your terminal for specific error messages
2. Verify that you're using a valid API key from Finnhub
3. Try running the test scripts with different stock symbols

## API Key Security

**IMPORTANT**: Never commit your API key to version control. The `.env` file is included in `.gitignore` to prevent this. If you accidentally commit your API key, you should revoke it immediately and generate a new one from your Finnhub dashboard.