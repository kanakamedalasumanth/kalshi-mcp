# Kalshi MCP Server

Hey! This is a simple Model Context Protocol (MCP) server that connects your AI agents (like OpenClaw or Claude) directly to the Kalshi prediction market. It lets your AI pull live events, analyze market sentiment, and even place trades. 

No complicated setups, just plain simple bridging between your AI and Kalshi.

> **⚠️ Note: This project is currently under active development. Some features or endpoints might occasionally not work as expected while we continue to build and improve.**
> ** Sports integration:** For live sports games, we are integrating with [balldontlie.io](https://www.balldontlie.io) for live score tracking!

---

## Installation Instructions

Follow these simple steps to get everything up and running:

### 1. Install MCPOrter
Make sure you have MCPOrter installed and set up on your machine before doing anything else.

### 2. Create API Key and PEM File
- Go to your Kalshi account settings: Account → API Keys
- Generate a new API key.
- Save your API key ID and download your private key (the `.pem` file). Keep that `.pem` file somewhere safe on your computer.

### 3. Build the Project
Open up your terminal, go to the folder where you downloaded this project, and run:
```bash
npm install
npm run build
```

### 4. Setup Config
Copy the example config file so you can add your details:
```bash
cp .env.example .env
```
Then open `.env` and put in your API info:
```ini
KALSHI_API_KEY_ID=your-api-key-id
KALSHI_PRIVATE_KEY_PATH=/absolute/path/to/your/private-key.pem
KALSHI_API_BASE_URL=https://api.elections.kalshi.com/trade-api/v2
LOG_LEVEL=info
```

### 5. OpenClaw Setup 
If you are using OpenClaw, you need to move the config file so OpenClaw knows about this tool.
Simply copy or move the `openclaw.json` file (or your specific openclaw config setup) to the folder where you installed OpenClaw. 

---

## What Does This Actually Do?

When your AI wants to know what's happening on Kalshi, or wants to place a bet, it simply sends a request to this server. This server handles all the annoying backend stuff (like signing your requests with RSA keys) and talks to Kalshi's API for you. Then it grabs the data and passes a clean, easy-to-read answer back to your AI.

It runs locally on your machine using standard input/output (stdio), which means zero network delay and no firewall headaches.

## Available Tools

We've got plenty of tools ready to use for your agents:

### Market Tools
- **get_live_events**: Find out what's currently happening.
- **get_event_details**: Dive deep into a specific event.
- **get_market_info**: Get all the details on a single market.
- **get_market_orderbook**: Look at the live buy and sell orders.
- **get_market_stats**: Get AI-friendly analytics like sentiment and momentum.
- **get_recent_trades**: See the actual transactions going through.
- **get_exchange_status**: Check if Kalshi is currently open for trading.

### Trading Tools (Careful, uses real money!)
- **create_order**: Place a buy or sell order.
- **cancel_order**: Cancel an order that hasn't filled yet.
- **get_order_status**: Check if your order went through.
- **get_open_orders**: See all your pending orders.

### Portfolio Tools
- **get_balance**: Check how much cash you have left.
- **get_positions**: Look at the markets you're currently holding.
- **get_fills**: Look at your history of completed trades.

### Search Tools
- **get_search_tags**: Find out what categories and tags you can filter by.
- **search_series**: Search for live games, politics, or other events using tags and categories.

That's it! Enjoy building your trading bots!
