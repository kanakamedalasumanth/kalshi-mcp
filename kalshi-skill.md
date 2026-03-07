# Kalshi MCP Skill

You have access to Kalshi prediction market tools. Match user intent to the correct tool and params.

---

## Tools

### Discovery

| Tool | Purpose | Params |
|------|---------|--------|
| `get_categories` | List all categories and tags | _none_ |
| `search_markets` | Find open/live markets | `category?` `tag?` `page_size?` `cursor?` |

### Portfolio (read-only)

| Tool | Purpose | Params |
|------|---------|--------|
| `get_balance` | Account balance + portfolio value | _none_ |
| `get_positions` | Current open positions | `ticker?` `event_ticker?` `limit?` `cursor?` |
| `get_fills` | Trade execution history | `ticker?` `limit?` `cursor?` |
| `get_settlements` | Resolved market payouts | `ticker?` `limit?` `cursor?` |

### Trading (real money)

| Tool | Purpose | Params |
|------|---------|--------|
| `create_order` | Place buy/sell order | `ticker` `side(yes/no)` `action(buy/sell)` `count` `yes_price?` `no_price?` `time_in_force?` |
| `cancel_order` | Cancel resting order | `order_id` |
| `get_order_status` | Check order fill status | `order_id` |
| `get_open_orders` | List unfilled orders | `ticker?` `event_ticker?` |

---

## Intent Map

### "What can I bet on?" / "What categories exist?"
-> `get_categories`

### Sports queries
| User says | Tool | Params |
|-----------|------|--------|
| "NBA games today" | `search_markets` | `category: "Sports"`, `tag: "Basketball"` |
| "NFL markets" | `search_markets` | `category: "Sports"`, `tag: "Football"` |
| "Soccer bets" | `search_markets` | `category: "Sports"`, `tag: "Soccer"` |
| "MLB odds" | `search_markets` | `category: "Sports"`, `tag: "Baseball"` |
| "Hockey markets" | `search_markets` | `category: "Sports"`, `tag: "Hockey"` |
| "Tennis betting" | `search_markets` | `category: "Sports"`, `tag: "Tennis"` |
| "Golf markets" | `search_markets` | `category: "Sports"`, `tag: "Golf"` |
| "MMA/UFC fights" | `search_markets` | `category: "Sports"`, `tag: "MMA"` |
| Any sport question | `search_markets` | `category: "Sports"`, `tag: <match sport>` |

### Non-sports queries
| User says | Tool | Params |
|-----------|------|--------|
| "Crypto/Bitcoin markets" | `search_markets` | `category: "Crypto"` |
| "Election / who wins presidency" | `search_markets` | `category: "Politics"` |
| "Weather markets" | `search_markets` | `category: "Weather"` |
| "Economy / Fed rate" | `search_markets` | `category: "Economics"` |
| "AI markets" | `search_markets` | `tag: "AI"` |
| "What's trending" | `search_markets` | _(no params = trending)_ |

### Account queries
| User says | Tool |
|-----------|------|
| "How much money do I have" / "my balance" | `get_balance` |
| "What positions do I hold" / "my bets" | `get_positions` |
| "My trade history" / "recent trades" | `get_fills` |
| "What markets settled" / "my payouts" | `get_settlements` |

### Trading actions
| User says | Tool | Params |
|-----------|------|--------|
| "Buy 5 YES on [ticker] at 60 cents" | `create_order` | `ticker, side:"yes", action:"buy", count:5, yes_price:60` |
| "Sell my NO contracts on [ticker]" | `create_order` | `ticker, side:"no", action:"sell", count:<ask>, no_price:<ask>` |
| "Cancel order [id]" | `cancel_order` | `order_id` |
| "Did my order fill?" | `get_order_status` | `order_id` |
| "Any open orders?" | `get_open_orders` | |

---

## Workflows

### Browse and bet (most common)
1. `get_categories` -> show user available categories/tags
2. `search_markets` -> find markets matching interest
3. Present markets with prices (yes_bid, yes_ask, last_price)
4. If user wants to trade -> `get_balance` first to confirm funds
5. `create_order` with ticker from step 2

### Check and manage positions
1. `get_positions` -> see open positions
2. `get_open_orders` -> see resting orders
3. If user wants to sell -> `create_order` with `action:"sell"`
4. If user wants to cancel -> `cancel_order`

### Post-trade check
1. `create_order` -> place trade
2. `get_order_status` -> verify fill
3. `get_positions` -> confirm position

---

## Rules

- `search_markets` returns: event_ticker, markets[].ticker, prices, volume, live scores (sports)
- Prices are in cents (1-99). A YES at 65 = 65% implied probability = $0.65 cost
- If unsure about category/tag, call `get_categories` first
- Use `ticker` (market-level) from search_markets results for trading
- Use `event_ticker` (event-level) for filtering positions/orders
- When user intent is unclear, default to `search_markets` with best-guess params
