---
name: kalshi
description: Trade and analyze Kalshi prediction markets via mcporter. Use when a user asks about prediction markets, event probabilities, trading, or market analysis on Kalshi.
author: Sumanth Kanakamedala
version: 1.0.0
---

# Kalshi Prediction Markets

Interact with Kalshi prediction markets — discover series, fetch live events, analyze market data, place trades, and manage portfolios.

## How to use

All Kalshi tools are accessed via mcporter. Run commands using:

```bash
mcporter call kalshi.<tool_name> [key=value ...]
```

### Discover available tools

```bash
mcporter list kalshi --schema
```

### Example workflow

```bash
mcporter call kalshi.get_search_tags
mcporter call kalshi.list_series category=Sports
mcporter call kalshi.get_live_events status=open limit=200
mcporter call kalshi.get_market_stats ticker=BTC-100K-MAR1
mcporter call kalshi.get_balance
```

## Important notes

- Prices are in **cents** (1-99). A YES contract at 65¢ = 65% implied probability.
- Always call `get_exchange_status` before trading.
