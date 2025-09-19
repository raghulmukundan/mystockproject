# MyStockProject - Comprehensive Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Frontend Architecture](#frontend-architecture)
4. [Backend Architecture](#backend-architecture)
5. [Database Structure](#database-structure)
6. [API Integrations](#api-integrations)
7. [Features](#features)
8. [Deployment](#deployment)
9. [Limitations and Considerations](#limitations-and-considerations)

## Project Overview

MyStockProject is a comprehensive stock monitoring and portfolio management application that allows users to create watchlists, monitor stock prices, set alerts, and analyze market data. The application integrates with external financial APIs to provide real-time market data and offers a responsive user interface for both desktop and mobile experiences.

The application aims to help investors track their stock portfolios, get insights into market trends, and make data-driven investment decisions.

## Technology Stack

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router v6
- **State Management**: React Hooks and Context API
- **HTTP Client**: Axios
- **UI Components**: 
  - Headless UI
  - Heroicons
  - Custom components
- **Charts**: 
  - Lightweight Charts
  - TradingView Widgets

### Backend
- **Framework**: FastAPI
- **Language**: Python 3.11+
- **Database ORM**: SQLAlchemy 2.0
- **Migration Tool**: Alembic
- **Task Scheduling**: APScheduler
- **HTTP Client**: aiohttp
- **Data Processing**: Pandas
- **Excel Support**: OpenPyxl
- **Testing**: Pytest, pytest-asyncio

### Database
- **Primary Database**: SQLite
- **File-based storage**: ./stock_watchlist.db

## Frontend Architecture

The frontend is built as a single-page application (SPA) using React and TypeScript. It uses a component-based architecture, with a clear separation between pages, components, and services.

### Key Directories
- `/src/pages`: Main page components for different routes
- `/src/components`: Reusable UI components
- `/src/services`: API client services for backend communication
- `/src/utils`: Utility functions
- `/src/types`: TypeScript type definitions

### Key Features
1. **Responsive Design**: Built with Tailwind CSS for a mobile-first approach
2. **Client-side Routing**: Using React Router for navigation
3. **Real-time Data Updates**: Regular polling for price updates
4. **Interactive Charts**: Integration with TradingView and custom chart components
5. **Form Validation**: Client-side validation for user inputs
6. **Error Handling**: Comprehensive error handling and user feedback

### Main Pages
1. **Dashboard**: Overview of market and portfolio performance
2. **Watchlists**: List of user-created watchlists
3. **WatchlistDetail**: Detailed view of a specific watchlist
4. **Alerts**: Alert management interface
5. **Chart**: Advanced charting for technical analysis
6. **Upload**: Data import functionality

## Backend Architecture

The backend is built using FastAPI, a modern, high-performance web framework for building APIs with Python. It follows a modular architecture with clear separation of concerns.

### Key Directories
- `/app/api`: API route definitions
- `/app/models`: Database models
- `/app/services`: Business logic services
- `/app/core`: Core configuration and database setup
- `/app/utils`: Utility functions
- `/app/alembic`: Database migrations

### API Routes
1. **Watchlists**: CRUD operations for watchlists
2. **Stocks**: Stock data and search endpoints
3. **Market**: Market data and statistics
4. **Alerts**: Alert configuration and management

### Services
1. **Stock Data Service**: Fetches and processes stock price data
2. **Cache Service**: Caches API responses to minimize external calls
3. **Alert Service**: Processes and triggers alerts
4. **Rule Engine**: Evaluates conditions for alert triggers
5. **Market Data Service**: Provides market-wide statistics

### Background Tasks
The application uses APScheduler to run background tasks, including:
1. Market data refreshes
2. Alert evaluations
3. Cache cleanup

## Database Structure

The application uses SQLite as its database, with the following key tables:

### Watchlist
- **id**: Primary key
- **name**: Watchlist name
- **description**: Optional description
- **created_at**: Creation timestamp
- **updated_at**: Last update timestamp

### WatchlistItem
- **id**: Primary key
- **watchlist_id**: Foreign key to Watchlist
- **symbol**: Stock symbol
- **company_name**: Company name
- **sector**: Industry sector
- **industry**: Specific industry
- **entry_price**: Optional purchase price
- **target_price**: Optional target price
- **stop_loss**: Optional stop loss price
- **created_at**: Creation timestamp

### Alert
- **id**: Primary key
- **watchlist_id**: Foreign key to Watchlist (optional)
- **symbol**: Stock symbol
- **alert_type**: Type of alert (price, percentage, etc.)
- **condition**: Comparison condition (>, <, =)
- **value**: Threshold value for the alert
- **notification_method**: How to notify (email, UI, etc.)
- **active**: Whether alert is active
- **triggered_at**: When the alert was last triggered
- **created_at**: Creation timestamp

### Rule
- **id**: Primary key
- **name**: Rule name
- **description**: Rule description
- **condition**: JSON-encoded condition logic
- **active**: Whether rule is active

## API Integrations

The application integrates with external financial APIs to provide real-time market data:

### Finnhub
- **Purpose**: Real-time stock quotes, company profiles, and financial metrics
- **Endpoints Used**:
  - `/quote`: Current price data
  - `/stock/profile2`: Company profile information
  - `/stock/metric`: Financial metrics including 52-week high/low
- **Rate Limits**: 60 API calls per minute (free tier)
- **Authentication**: API key required in query parameters

### TradingView
- **Purpose**: Interactive charts and technical analysis tools
- **Integration**: Client-side widget embedding
- **Features Used**:
  - Price charts
  - Technical indicators
  - Company profiles
  - Financial data displays

## Features

### Watchlist Management
1. **Create Watchlists**: Create named collections of stocks
2. **Add/Remove Stocks**: Manage stocks in watchlists
3. **Set Entry/Target/Stop Prices**: Track investment goals
4. **Group and Filter**: Organize stocks by sector, industry, etc.
5. **Performance Tracking**: Track performance against entry prices

### Stock Data
1. **Real-time Prices**: Current stock prices updated regularly
2. **Price History**: Historical price data for analysis
3. **Key Metrics**: 52-week high/low, daily/weekly/monthly changes
4. **Company Profiles**: Sector, industry, market cap information

### Alerts System
1. **Price Alerts**: Notifications when prices cross thresholds
2. **Condition-based Alerts**: Complex conditions using rule engine
3. **Alert Management**: Enable/disable/delete alerts
4. **Alert History**: Track triggered alerts

### Market Analysis
1. **Interactive Charts**: Technical analysis charts
2. **Performance Metrics**: Portfolio and watchlist performance tracking
3. **Market Insights**: Overview of market trends
4. **Technical Indicators**: Moving averages, RSI, MACD, etc.

### Data Import/Export
1. **Excel Import**: Upload watchlists from Excel files
2. **Symbol Validation**: Validate symbols against market data
3. **Bulk Operations**: Perform operations on multiple stocks

### User Interface
1. **Responsive Design**: Works on desktop and mobile
2. **Dark/Light Modes**: Visual preference options
3. **Interactive Elements**: Drag-and-drop, real-time updates
4. **Data Visualization**: Charts, performance indicators, etc.

## Deployment

### Development Environment
- **Frontend**: Vite dev server (`npm run dev`)
- **Backend**: Uvicorn development server (`uvicorn app.main:app --reload`)
- **Database**: SQLite file-based database

### Production Considerations
- **Frontend**: 
  - Build with `npm run build`
  - Serve static files via Nginx or similar
- **Backend**: 
  - Run with Uvicorn or Gunicorn behind Nginx
  - Consider adding proper logging configuration
- **Database**: 
  - For larger deployments, consider migrating to PostgreSQL
  - Implement backup strategies

### Environment Variables
- **FINNHUB_API_KEY**: API key for Finnhub service
- **DATABASE_URL**: Database connection string (defaults to SQLite)
- **NASDAQ_API_KEY**: Optional API key for additional data

## Limitations and Considerations

### API Limits
- **Finnhub Free Tier**: Limited to 60 requests per minute
- **Data Availability**: Some stocks may have incomplete data

### Performance
- **Cache Strategy**: Implemented to reduce API calls
- **Market Hours**: Different refresh strategies during/outside market hours

### Security
- **API Keys**: Must be properly secured in environment variables
- **CORS**: Currently configured for development (localhost only)

### Scaling
- **SQLite Limitations**: Not suitable for high-concurrency environments
- **Background Tasks**: May need more robust solution for production

### Data Accuracy
- **Third-party Data**: Dependent on accuracy of Finnhub data
- **Free Tier Limitations**: Some premium data may not be available

## Conclusion

MyStockProject provides a comprehensive solution for stock tracking and portfolio management, integrating modern web technologies with financial data APIs. The application is designed to be extensible, with a modular architecture that allows for future enhancements and integrations.

With features ranging from basic watchlist management to advanced technical analysis, the application aims to serve both casual investors and more serious traders, providing the tools needed to make informed investment decisions.