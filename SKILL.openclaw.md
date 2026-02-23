---
name: kalshi
description: Trade and analyze Kalshi prediction markets via mcporter. Use when a user asks about prediction markets, event probabilities, trading, or market analysis on Kalshi.
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

## Important notes

- Prices are in **cents** (1-99). A YES contract at 65¢ = 65% implied probability.
- Always call `get_exchange_status` before trading.