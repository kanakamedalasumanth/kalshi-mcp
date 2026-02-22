# Kalshi MCP Server

A **Model Context Protocol (MCP)** server that connects AI agents to the [Kalshi](https://kalshi.com) prediction market exchange. Pull live events, analyze market sentiment, and execute trades — all through standardised MCP tools.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [How It Works — The Full Flow](#how-it-works--the-full-flow)
3. [Authentication — RSA Signing Explained](#authentication--rsa-signing-explained)
4. [Stdio vs HTTP Transport](#stdio-vs-http-transport)
5. [All 14 MCP Tools (Detailed)](#all-14-mcp-tools-detailed)
6. [TypeScript Interfaces — Full Reference](#typescript-interfaces--full-reference)
7. [API Client Methods — Parameters & Examples](#api-client-methods--parameters--examples)
8. [File-by-File Reference](#file-by-file-reference)
9. [Logging System](#logging-system)
10. [OpenClaw Integration](#openclaw-integration)
11. [Environment Variables](#environment-variables)
12. [How Kalshi Markets Work](#how-kalshi-markets-work)

---

## Quick Start

### Prerequisites

- **Node.js 18+** (native fetch support required)
- **Kalshi account** with API access at [kalshi.com](https://kalshi.com)
- **API Key** generated at Account → API Keys

### Install & Build

```bash
cd Kalshi-MCP
npm install
npm run build
```

### Configure

```bash
cp .env.example .env
```

Edit `.env`:
```ini
KALSHI_API_KEY_ID=your-api-key-id
KALSHI_PRIVATE_KEY_PATH=/absolute/path/to/your/private-key.pem
KALSHI_API_BASE_URL=https://api.elections.kalshi.com/trade-api/v2
LOG_LEVEL=info
```

> **💡 Demo Mode**: Set `KALSHI_API_BASE_URL=https://demo-api.kalshi.co/trade-api/v2` to test with play money.

### Run

```bash
npm start
```

---

## How It Works — The Full Flow

Here's what happens when an AI agent (OpenClaw/Claude) calls a tool like `get_live_events`:

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Agent sends JSON-RPC request via stdin                      │
│   {"method":"tools/call","params":{"name":"get_live_events",...}}    │
│                                                                     │
│ STEP 2: MCP Server receives it, finds the matching tool             │
│   → src/tools/market-tools.ts → get_live_events handler             │
│                                                                     │
│ STEP 3: Tool handler calls the API client                           │
│   → eventsApi.getEvents({ status: "open", with_nested_markets: true })
│                                                                     │
│ STEP 4: API client calls the HTTP client                            │
│   → client.get("/events", { status: "open", ... })                  │
│                                                                     │
│ STEP 5: HTTP client asks the signer for auth headers                │
│   → signer.sign("GET", "/trade-api/v2/events")                     │
│   → Produces: KALSHI-ACCESS-KEY, KALSHI-ACCESS-TIMESTAMP,           │
│               KALSHI-ACCESS-SIGNATURE (fresh for EVERY request)     │
│                                                                     │
│ STEP 6: HTTP client sends fetch() with auth headers                 │
│   → GET https://api.elections.kalshi.com/trade-api/v2/events        │
│                                                                     │
│ STEP 7: Response flows back                                         │
│   Kalshi API → HTTP client → API client → Tool handler → MCP Server │
│   → Agent receives JSON-RPC response via stdout                     │
│                                                                     │
│ LOGGING: Every step above is logged to stderr as structured JSON    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Authentication — RSA Signing Explained

### Does it sign every single API call?

**Yes.** Every single HTTP request gets a fresh, unique signature. You cannot reuse signatures because:

1. The **timestamp** is embedded in the signature (millisecond precision)
2. Kalshi **rejects stale timestamps** (replay attack protection)
3. The **method + path** are part of the signed payload, so a signature for `GET /events` can't be reused for `POST /portfolio/orders`

### What gets signed?

The signer creates a message string by concatenating three things:

```
message = timestamp + method + path
```

**Example:**
```
timestamp = "1708000000000"        (current Unix time in milliseconds)
method    = "GET"                  (HTTP method, uppercased)
path      = "/trade-api/v2/events" (full path from URL)

message   = "1708000000000GET/trade-api/v2/events"
```

This message is then signed using **RSA-PSS** with **SHA-256** digest and a **32-byte salt**, producing a base64-encoded signature string.

### The three auth headers

Every request to Kalshi includes these three headers:

| Header | Value | Example |
|--------|-------|---------|
| `KALSHI-ACCESS-KEY` | Your API key ID | `abc123def456` |
| `KALSHI-ACCESS-TIMESTAMP` | Unix timestamp in ms | `1708000000000` |
| `KALSHI-ACCESS-SIGNATURE` | RSA-PSS signature (base64) | `a1b2c3d4e5f6...` |

### Performance note

The **private key is read from disk only once** (at startup). It's cached in memory. The `sign()` method itself is pure CPU crypto — it runs in ~1ms.

---

## Stdio vs HTTP Transport

MCP supports different ways for agents to communicate with servers. We use **stdio**:

| Feature | Stdio Transport (✅ what we use) | HTTP Transport |
|---------|----------------------------------|----------------|
| **How it connects** | Agent spawns the server as a child process, pipes stdin/stdout | Agent connects over TCP to a URL like `http://localhost:3000` |
| **Latency** | Near-zero (no network stack) | TCP handshake + HTTP overhead (~1-5ms per call) |
| **Setup needed** | None — just `"command": "node", "args": ["dist/index.js"]` | Need to pick a port, handle CORS, maybe TLS |
| **Security** | Process is local, no network exposure | Must secure the endpoint (auth, firewall) |
| **Multiple agents** | One agent per server process | Multiple agents can share one server |
| **Best for** | Local agents (OpenClaw, Claude Desktop) | Cloud-hosted agents, shared servers |

**Why we chose stdio:** Your use case is a local agent connecting directly to Kalshi. Stdio gives us instant, zero-config connectivity. The agent spawns our process and talks to it directly — no ports, no firewalls, no delays.

### How it looks at the OS level

```bash
# This is essentially what OpenClaw does internally:
echo '{"jsonrpc":"2.0","method":"tools/list"}' | node dist/index.js
#     ↑ stdin (agent sends)                        ↑ stdout (server responds)
#                                   Logs go to stderr (never interferes)
```

---

## All 14 MCP Tools (Detailed)

### 📊 Market Data Tools (7 tools)

#### `get_live_events`
**Purpose:** Discover what's currently happening on Kalshi.

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `status` | `"open" \| "closed" \| "settled"` | No | Filter by lifecycle | `"open"` |
| `series_ticker` | `string` | No | Filter to a series | `"KXBTC"` |
| `limit` | `number` (1-200) | No | Max results | `20` |
| `cursor` | `string` | No | Pagination cursor | `"abc123"` |

**Example agent call:**
```
"Get me all open prediction markets about Bitcoin"
→ Agent calls: get_live_events({ status: "open", series_ticker: "KXBTC" })
```

**Returns:** List of events with their nested markets, including ticker, title, prices, and volume.

---

#### `get_event_details`
**Purpose:** Deep dive into a specific event and all its markets.

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `event_ticker` | `string` | **Yes** | The event to look up | `"KXBTC-26FEB21"` |

**Example agent call:**
```
"Tell me more about the Bitcoin price event"
→ Agent calls: get_event_details({ event_ticker: "KXBTC-26FEB21" })
```

**Returns:** Full event data + all markets + settlement sources (where Kalshi gets the answer).

---

#### `get_market_info`
**Purpose:** Get every detail about a single market.

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `ticker` | `string` | **Yes** | Market ticker | `"BTC-100K-MAR1"` |

**Returns:** Prices (bid/ask/last), volume, open interest, rules, timing, and settlement info.

---

#### `get_market_orderbook`
**Purpose:** See the live supply/demand at each price level.

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `ticker` | `string` | **Yes** | Market ticker | `"BTC-100K-MAR1"` |
| `depth` | `number` (1-100) | No | Price levels to show | `10` |

**Returns:** Arrays of price levels for YES bids and NO bids, each with price + quantity.

---

#### `get_market_stats`
**Purpose:** AI-friendly analytics — spread, momentum, sentiment direction.

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `ticker` | `string` | **Yes** | Market to analyze | `"BTC-100K-MAR1"` |

**How sentiment is calculated:**
```
Fetches last 50 trades → counts YES taker trades vs NO taker trades
  If YES > 1.5× NO → "BULLISH"
  If NO > 1.5× YES → "BEARISH"
  Otherwise         → "NEUTRAL"
```

**Returns:** Implied probability, price change, spread, volume trends, and sentiment indicator.

---

#### `get_recent_trades`
**Purpose:** See actual executed transactions.

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `ticker` | `string` | No | Filter to one market | `"BTC-100K-MAR1"` |
| `limit` | `number` (1-1000) | No | Number of trades | `50` |

---

#### `get_exchange_status`
**Purpose:** Is Kalshi open right now? Always check before trading.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *(none)* | — | — | No parameters needed |

**Returns:** `{ exchange_active: true, trading_active: true, can_trade: true }`

---

### 💰 Trading Tools (4 tools)

#### `create_order`
**Purpose:** Place a buy or sell order. **This uses real money.**

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `ticker` | `string` | **Yes** | Market to trade | `"BTC-100K-MAR1"` |
| `side` | `"yes" \| "no"` | **Yes** | Which side | `"yes"` |
| `action` | `"buy" \| "sell"` | **Yes** | Buy or sell | `"buy"` |
| `count` | `number` (≥1) | **Yes** | Number of contracts | `10` |
| `yes_price` | `number` (1-99) | No* | YES price in cents | `65` |
| `no_price` | `number` (1-99) | No* | NO price in cents | `35` |
| `time_in_force` | `string` | No | How long the order lives | `"good_till_canceled"` |
| `client_order_id` | `string` | No | Your tracking ID | `"my-order-001"` |

*\* Provide `yes_price` OR `no_price` (not both). The other side is automatically 100 - price.*

**What the combinations mean:**
```
buy  + yes = "I bet this WILL happen"    → Pay yes_price, receive $1 if YES
buy  + no  = "I bet this WON'T happen"  → Pay no_price, receive $1 if NO
sell + yes = "Close my YES position"     → You already hold YES contracts
sell + no  = "Close my NO position"      → You already hold NO contracts
```

**Time in force options:**
- `"good_till_canceled"` (default): Stays on the order book until filled or you cancel
- `"fill_or_kill"`: Must fill completely RIGHT NOW or cancel entirely
- `"immediate_or_cancel"`: Fill as much as possible now, cancel the rest

**Example:**
```
"Buy 10 YES contracts on BTC-100K at 65 cents"
→ create_order({
    ticker: "BTC-100K-MAR1",
    side: "yes",
    action: "buy",
    count: 10,
    yes_price: 65
  })
→ If BTC goes above 100K: you paid $6.50, receive $10.00 → profit $3.50
→ If BTC stays below: you lose $6.50
```

---

#### `cancel_order`
**Purpose:** Cancel an unfilled order.

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `order_id` | `string` | **Yes** | Order to cancel | `"abc123-def456"` |

If the order is partially filled, only the remaining unfilled portion is cancelled. Already-filled contracts are yours.

---

#### `get_order_status`
**Purpose:** Check if your order has been filled.

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `order_id` | `string` | **Yes** | Order to check | `"abc123-def456"` |

**Returns:** Status (resting/executed/canceled), fill count, remaining count, fees.

---

#### `get_open_orders`
**Purpose:** See all your currently resting (unfilled) orders.

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `ticker` | `string` | No | Filter to a market | `"BTC-100K-MAR1"` |
| `event_ticker` | `string` | No | Filter to an event | `"KXBTC-26FEB21"` |

---

### 📈 Portfolio Tools (3 tools)

#### `get_balance`
**Purpose:** How much cash do you have?

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *(none)* | — | — | No parameters needed |

**Returns:**
```json
{
  "balance_cents": 50000,
  "balance_dollars": "500.00",
  "portfolio_value_cents": 75000,
  "portfolio_value_dollars": "750.00"
}
```

---

#### `get_positions`
**Purpose:** What markets do you hold contracts in?

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `ticker` | `string` | No | Filter to a market | `"BTC-100K-MAR1"` |
| `event_ticker` | `string` | No | Filter to an event | `"KXBTC-26FEB21"` |
| `limit` | `number` (1-1000) | No | Max results | `50` |

**Returns:** For each position: ticker, position size (positive=YES, negative=NO), realized P&L, fees, settlement status.

---

#### `get_fills`
**Purpose:** History of completed trades.

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `ticker` | `string` | No | Filter to a market | `"BTC-100K-MAR1"` |
| `limit` | `number` (1-1000) | No | Max results | `20` |

**Returns:** Each fill shows: trade ID, order ID, ticker, side, action, count, prices, maker/taker status, time.

---

## TypeScript Interfaces — Full Reference

### Market
The central data model. Represents a single yes/no question you can trade on.

```typescript
interface Market {
  // ── Identity ─────────────────────────────
  ticker: string;           // "BTC-100K-MAR1" — unique market ID
  event_ticker: string;     // "KXBTC-26FEB21" — parent event
  market_type: "binary";    // Always "binary" for yes/no markets

  // ── Titles ───────────────────────────────
  yes_sub_title: string;    // "Bitcoin above $100K" — what YES means
  no_sub_title: string;     // "Bitcoin below $100K" — what NO means

  // ── Current Prices (dollars) ─────────────
  yes_bid_dollars: string;  // "0.6200" — best YES buy offer ($0.62)
  yes_ask_dollars: string;  // "0.6500" — cheapest YES sell offer ($0.65)
  no_bid_dollars: string;   // "0.3500" — best NO buy offer ($0.35)
  no_ask_dollars: string;   // "0.3800" — cheapest NO sell offer ($0.38)
  last_price_dollars: string; // "0.6300" — last traded price (= 63% probability)

  // ── Historical Prices ────────────────────
  previous_price_dollars: string;     // "0.5800" — price 24h ago
  previous_yes_bid_dollars: string;   // "0.5600" — YES bid 24h ago

  // ── Volume & Activity ────────────────────
  volume: number;           // 150000 — total contracts ever traded
  volume_24h: number;       // 5000 — contracts in the last 24 hours
  open_interest: number;    // 25000 — currently outstanding contracts

  // ── Lifecycle ────────────────────────────
  status: string;           // "active" — can be: initialized, inactive,
                            //   active, closed, determined, finalized
  open_time: string;        // "2026-02-01T00:00:00Z" — trading opens
  close_time: string;       // "2026-03-01T00:00:00Z" — trading closes
  result: string;           // "" while active, "yes" or "no" after settlement

  // ── Rules ────────────────────────────────
  rules_primary: string;    // "Resolves Yes if BTC/USD ≥ $100,000..."
  rules_secondary: string;  // "Settlement source: CoinGecko..."
  can_close_early: boolean; // true — market may close before close_time
}
```

### EventData
Groups related markets together (like a "category" or "question").

```typescript
interface EventData {
  event_ticker: string;      // "KXBTC-26FEB21" — unique event ID
  series_ticker: string;     // "KXBTC" — recurring series (e.g. daily BTC)
  title: string;             // "Bitcoin Price on February 26, 2026"
  sub_title: string;         // "BTC 02/26"
  category: string;          // "Crypto"
  mutually_exclusive: boolean; // true — only one market can resolve YES
  markets?: Market[];        // Nested markets (if requested)
}
```

### Order
Represents a buy/sell order you've placed.

```typescript
interface Order {
  order_id: string;          // "a1b2c3d4" — Kalshi-assigned ID
  ticker: string;            // "BTC-100K-MAR1" — which market
  side: "yes" | "no";        // Which side you're on
  action: "buy" | "sell";    // Whether you're opening or closing
  status: string;            // "resting" (pending), "executed" (filled), "canceled"
  count: number;             // 10 — original order quantity
  fill_count: number;        // 7 — how many contracts matched
  remaining_count: number;   // 3 — still waiting to match
  yes_price: number;         // 65 — price in cents
  no_price: number;          // 35 — complementary price (100 - 65)
  created_time: string;      // "2026-02-20T21:00:00Z"
  taker_fees: number;        // 3 — fees paid in cents
}
```

### Position
Your holding in a specific market.

```typescript
interface Position {
  ticker: string;            // "BTC-100K-MAR1"
  event_ticker: string;      // "KXBTC-26FEB21"
  position: number;          // 10 = holding 10 YES contracts
                             // -5 = holding 5 NO contracts
                             //  0 = no position
  total_traded: number;      // 25 — lifetime contracts traded here
  resting_orders_count: number; // 2 — open orders in this market
  fees_paid: number;         // 150 — total fees in cents
  realized_pnl: number;      // 350 — realized profit/loss in cents
  market_result: string;     // "" (pending) or "yes"/"no" (settled)
}
```

### Fill
A completed trade match.

```typescript
interface Fill {
  trade_id: string;          // "trade-xyz" — unique fill ID
  order_id: string;          // "a1b2c3d4" — which order was filled
  ticker: string;            // "BTC-100K-MAR1"
  side: "yes" | "no";        // Which side
  action: "buy" | "sell";    // Buy or sell
  count: number;             // 5 — contracts in this fill
  yes_price: number;         // 65 — execution price in cents
  no_price: number;          // 35
  is_taker: boolean;         // true = you crossed the spread
  created_time: string;      // "2026-02-20T21:05:30Z"
}
```

### Orderbook
The live supply/demand for a market.

```typescript
interface Orderbook {
  yes: OrderbookLevel[];     // YES side buy orders
  no: OrderbookLevel[];      // NO side buy orders
  // Dollar versions (preferred):
  yes_dollars: PriceLevelDollars[];
  no_dollars: PriceLevelDollars[];
}

// Each level:
interface PriceLevelDollars {
  price: string;             // "0.6500" — price in dollars
  quantity: number;          // 100 — contracts at this price
}
```

### Balance
Your account balances.

```typescript
interface Balance {
  balance: number;           // 50000 — available cash in cents ($500.00)
  portfolio_value: number;   // 75000 — total value in cents ($750.00)
}
```

---

## API Client Methods — Parameters & Examples

### Events API (`src/api/events.ts`)

#### `getEvents(params?)`
```typescript
// Get all open events
const result = await eventsApi.getEvents({ status: "open" });

// Get Bitcoin events with markets included
const result = await eventsApi.getEvents({
  status: "open",
  series_ticker: "KXBTC",
  with_nested_markets: true,
  limit: 10,
});

// Paginate through results
const page2 = await eventsApi.getEvents({ cursor: result.cursor });
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | `"open" \| "closed" \| "settled"` | Event lifecycle filter |
| `series_ticker` | `string` | Parent series (e.g. `"KXBTC"`) |
| `limit` | `number` (1-200) | Results per page |
| `cursor` | `string` | Pagination cursor from previous response |
| `with_nested_markets` | `boolean` | Include markets inside each event |

#### `getEvent(eventTicker, withNestedMarkets?)`
```typescript
const result = await eventsApi.getEvent("KXBTC-26FEB21", true);
// result.event = EventData
// result.markets = Market[]
```

#### `getEventMetadata(eventTicker)`
```typescript
const meta = await eventsApi.getEventMetadata("KXBTC-26FEB21");
// meta.settlement_sources = [{ name: "CoinGecko", url: "..." }]
// meta.image_url = "https://..."
```

---

### Markets API (`src/api/markets.ts`)

#### `getMarket(ticker)`
```typescript
const result = await marketsApi.getMarket("BTC-100K-MAR1");
// result.market.last_price_dollars = "0.6300"
// result.market.volume_24h = 5000
// result.market.status = "active"
```

#### `getMarketOrderbook(ticker, depth?)`
```typescript
const ob = await marketsApi.getMarketOrderbook("BTC-100K-MAR1", 10);
// ob.orderbook.yes_dollars = [{ price: "0.65", quantity: 100 }, ...]
// ob.orderbook.no_dollars  = [{ price: "0.35", quantity: 80 }, ...]
```

#### `getMarketCandlesticks(seriesTicker, ticker, startTs, endTs, interval)`
```typescript
const candles = await marketsApi.getMarketCandlesticks(
  "KXBTC",           // series
  "BTC-100K-MAR1",   // market
  1708000000,        // start (Unix seconds)
  1708100000,        // end
  60                 // 60 = hourly candles (1=1min, 1440=daily)
);
```

#### `getTrades(params?)`
```typescript
const trades = await marketsApi.getTrades({
  ticker: "BTC-100K-MAR1",
  limit: 50,
});
```

---

### Trading API (`src/api/trading.ts`)

#### `createOrder(request)`
```typescript
// Buy 10 YES contracts at 65¢
const result = await tradingApi.createOrder({
  ticker: "BTC-100K-MAR1",
  side: "yes",
  action: "buy",
  count: 10,
  yes_price: 65,
  time_in_force: "good_till_canceled",
});
// result.order.order_id = "abc123"
// result.order.status = "resting" (if not immediately filled)
```

#### `cancelOrder(orderId)`
```typescript
const result = await tradingApi.cancelOrder("abc123");
// result.reduced_by = 10 (cancelled 10 contracts)
```

#### `getOrder(orderId)` / `getOrders(params?)`
```typescript
const order = await tradingApi.getOrder("abc123");
const allOrders = await tradingApi.getOrders({ status: "resting" });
```

---

### Portfolio API (`src/api/portfolio.ts`)

#### `getBalance()`
```typescript
const bal = await portfolioApi.getBalance();
// bal.balance = 50000 (cents) → $500.00
// bal.portfolio_value = 75000 (cents) → $750.00
```

#### `getPositions(params?)`
```typescript
const pos = await portfolioApi.getPositions({ count_filter: "position" });
// pos.market_positions = [{ ticker: "...", position: 10, ... }]
```

#### `getFills(params?)` / `getSettlements(params?)`
```typescript
const fills = await portfolioApi.getFills({ ticker: "BTC-100K-MAR1", limit: 20 });
const settlements = await portfolioApi.getSettlements({ limit: 10 });
```

---

## File-by-File Reference

```
Kalshi-MCP/
├── package.json          — Project config, dependencies, scripts
├── tsconfig.json         — TypeScript compiler config (ES2022, strict mode)
├── .env.example          — Template for API credentials
├── .gitignore            — Ignores node_modules, dist, .env, *.pem
├── openclaw.json         — OpenClaw MCP server discovery config
├── README.md             — This documentation
│
└── src/
    ├── index.ts           — ENTRY POINT: loads config, creates server,
    │                        connects stdio transport, handles shutdown
    │
    ├── server.ts          — SERVER FACTORY: wires together signer →
    │                        client → API modules → tool registration
    │
    ├── config.ts          — CONFIG LOADER: reads env vars, validates
    │                        required fields, provides typed defaults
    │
    ├── logger.ts          — STRUCTURED LOGGER: JSON logs to stderr,
    │                        levelled (debug/info/warn/error), with
    │                        timing helper for measuring API call duration
    │
    ├── auth/
    │   ├── signer.ts      — RSA SIGNER: reads private key once from disk,
    │   │                    signs each request with RSA-PSS SHA-256.
    │   │                    Called automatically on every API request.
    │   │
    │   └── client.ts      — HTTP CLIENT: wraps fetch() with auto-signing.
    │                        Methods: get(), post(), put(), delete().
    │                        Handles errors, JSON parsing, query params.
    │
    ├── types/
    │   └── kalshi.ts      — TYPE DEFINITIONS: 20+ TypeScript interfaces
    │                        matching Kalshi's OpenAPI spec. All response
    │                        and request shapes are typed.
    │
    ├── api/               — API CLIENT LAYER (one file per domain)
    │   ├── events.ts      — getEvents(), getEvent(), getEventMetadata()
    │   ├── markets.ts     — getMarket(), getMarketOrderbook(),
    │   │                    getMarketCandlesticks(), getTrades()
    │   ├── trading.ts     — createOrder(), getOrder(), getOrders(),
    │   │                    cancelOrder()
    │   ├── portfolio.ts   — getBalance(), getPositions(), getFills(),
    │   │                    getSettlements()
    │   └── exchange.ts    — getStatus(), getSchedule()
    │
    └── tools/             — MCP TOOL DEFINITIONS (agent-facing)
        ├── market-tools.ts    — 7 tools: get_live_events, get_event_details,
        │                        get_market_info, get_market_orderbook,
        │                        get_market_stats, get_recent_trades,
        │                        get_exchange_status
        ├── trading-tools.ts   — 4 tools: create_order, cancel_order,
        │                        get_order_status, get_open_orders
        └── portfolio-tools.ts — 3 tools: get_balance, get_positions,
                                 get_fills
```

---

## Logging System

Every module has its own named logger. Logs are **structured JSON written to stderr** (not stdout — stdout is the MCP protocol channel).

### Log format

```json
{"timestamp":"2026-02-20T21:00:00.000Z","level":"info","logger":"KalshiClient","message":"Sending request","data":{"method":"GET","path":"/events"}}
{"timestamp":"2026-02-20T21:00:00.150Z","level":"info","logger":"KalshiClient","message":"GET /events — completed","durationMs":148,"data":{"status":200}}
```

### Log levels

| Level | When used | Example |
|-------|-----------|---------|
| `debug` | Verbose internals | Signing details, request params |
| `info` | Standard operations | Tool calls, API requests, results |
| `warn` | Unusual but not broken | Unexpected response shape |
| `error` | Something failed | API errors, network failures |

### Timing

Every API call is automatically timed:
```typescript
const done = log.time("GET /events");
// ... do the work ...
done({ eventCount: 42 });
// Logs: {"message":"GET /events — completed","durationMs":148,"data":{"eventCount":42}}
```

Set `LOG_LEVEL=debug` in your `.env` for maximum detail during development.

---

## OpenClaw Integration

### Option 1: Project-level config

Edit `openclaw.json` with your credentials:

```json
{
  "mcpServers": {
    "kalshi": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/home/suser/Documents/Kalshi-MCP",
      "env": {
        "KALSHI_API_KEY_ID": "your-api-key-id",
        "KALSHI_PRIVATE_KEY_PATH": "/path/to/private-key.pem"
      }
    }
  }
}
```

### Option 2: Global config

Add the `kalshi` server entry to your global `~/.config/openclaw/openclaw.json` file (or wherever your OpenClaw config lives).

Once configured, start OpenClaw and all 14 Kalshi tools will be available to your agent.

---

## Architecture

```
Agent (OpenClaw/Claude) ←→ stdio ←→ MCP Server ←→ RSA Auth ←→ Kalshi REST API
```

### File Structure

```
src/
├── index.ts              # Entry point — connects stdio transport
├── server.ts             # MCP server factory — wires everything together
├── config.ts             # Environment configuration loader
├── logger.ts             # Structured JSON logger (writes to stderr)
├── auth/
│   ├── signer.ts         # RSA-PSS request signing
│   └── client.ts         # Authenticated HTTP client
├── types/
│   └── kalshi.ts         # TypeScript interfaces for all API models
├── api/
│   ├── events.ts         # Events API client
│   ├── markets.ts        # Markets API client
│   ├── trading.ts        # Orders API client
│   ├── portfolio.ts      # Portfolio API client
│   └── exchange.ts       # Exchange status API client
└── tools/
    ├── market-tools.ts   # 7 MCP tools for market data
    ├── trading-tools.ts  # 4 MCP tools for order management
    └── portfolio-tools.ts # 3 MCP tools for portfolio queries
```

### Logging

All logs are written as **structured JSON to stderr** (stdout is reserved for MCP's JSON-RPC protocol). Every API call is logged with:
- Timestamp, log level, and module name
- Request parameters and response metadata
- Duration timing for performance monitoring
- Error details on failures

Set `LOG_LEVEL=debug` for verbose output during development.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `KALSHI_API_KEY_ID` | ✅ | — | Your Kalshi API key ID |
| `KALSHI_PRIVATE_KEY_PATH` | ✅ | — | Path to RSA private key PEM file |
| `KALSHI_API_BASE_URL` | ❌ | Production URL | API base URL |
| `LOG_LEVEL` | ❌ | `info` | Log level: debug, info, warn, error |

---

## How Kalshi Markets Work

Kalshi is a **CFTC-regulated prediction market exchange**. Key concepts:

- **Events** group related markets (e.g., "2024 Election")
- **Markets** are individual yes/no questions (e.g., "Will candidate X win?")
- **Contracts** cost 1¢–99¢ and pay $1 if correct, $0 if wrong
- **Price = implied probability** (65¢ = 65% chance)
- **YES bid** at 65¢ = **NO ask** at 35¢ (they're equivalent)

---

## License

MIT
