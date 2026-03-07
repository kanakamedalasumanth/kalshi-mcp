// ============================================
// src/types/kalshi.ts — TypeScript Interfaces for Kalshi API
// ============================================
// These interfaces mirror the schemas defined in Kalshi's OpenAPI spec
// (v3.8.0). They give us compile-time type safety when working with
// API responses and requests.
//
// NAMING CONVENTION:
// - Response wrappers end with "Response" (e.g. GetEventsResponse)
// - Core data objects use the Kalshi name (Market, EventData, Order)
// - We use the dollar-denominated fields (e.g. yes_bid_dollars) as
//   they are the non-deprecated versions
// ============================================

// ─── Core Data Models ──────────────────────────────────────────

/**
 * Market — a single binary prediction market on Kalshi.
 *
 * Each market represents a yes/no question (e.g., "Will Bitcoin be
 * above $100k on March 1?"). Users trade contracts whose value is either
 * $0 or $1 (100¢) at settlement. Current prices reflect the market's
 * implied probability.
 */
export interface Market {
    ticker: string;                    // Unique market identifier (e.g. "BTC-100K-MAR1")
    event_ticker: string;              // Parent event identifier
    market_type: "binary" | "scalar";  // Type of market
    title: string;                     // Full market title
    subtitle: string;                  // Shortened title
    yes_subtitle: string;             // Short YES side description
    no_subtitle: string;              // Short NO side description

    // ── Timestamps ─────────────────────────────────────
    created_time: string;              // When the market was created
    updated_time: string;              // Last metadata update
    open_time: string;                 // When trading opens
    close_time: string;                // When trading closes
    expected_expiration_time?: string;  // Expected settlement time
    latest_expiration_time: string;    // Latest possible expiration

    // ── Lifecycle ──────────────────────────────────────
    status: "initialized" | "inactive" | "active" | "closed" | "determined" | "disputed" | "amended" | "finalized";
    result: "yes" | "no" | "scalar" | "";
    can_close_early: boolean;
    settlement_timer_seconds: number;

    // ── Pricing (dollar-denominated, non-deprecated) ──
    yes_bid_dollars: string;           // Best YES buy price
    yes_ask_dollars: string;           // Best YES sell price
    no_bid_dollars: string;            // Best NO buy price
    no_ask_dollars: string;            // Best NO sell price
    last_price_dollars: string;        // Last trade price
    previous_price_dollars: string;    // Price 24h ago
    previous_yes_bid_dollars: string;  // YES bid 24h ago
    previous_yes_ask_dollars: string;  // YES ask 24h ago
    notional_value_dollars: string;    // Contract notional value

    // ── Legacy pricing (cents, deprecated) ─────────────
    yes_bid: number;
    yes_ask: number;
    no_bid: number;
    no_ask: number;
    last_price: number;
    previous_yes_bid: number;
    previous_yes_ask: number;
    previous_price: number;
    notional_value: number;

    // ── Volume & Interest ──────────────────────────────
    volume: number;                    // Total contracts traded
    volume_fp: string;                 // Fixed-point volume string
    volume_24h: number;                // 24-hour volume
    volume_24h_fp: string;             // Fixed-point 24h volume
    open_interest: number;             // Outstanding contracts
    open_interest_fp: string;          // Fixed-point open interest
    liquidity: number;                 // Deprecated, always 0
    liquidity_dollars: string;         // Deprecated

    // ── Rules & Structure ──────────────────────────────
    rules_primary: string;             // Plain-language rules
    rules_secondary: string;           // Secondary rules
    fractional_trading_enabled: boolean;
    expiration_value: string;          // Settlement reference value
    tick_size: number;                 // Deprecated
    price_level_structure: string;     // Price structure definition

    // ── Optional fields ────────────────────────────────
    settlement_value?: number;          // Cents, filled after determination
    settlement_value_dollars?: string;  // Dollars, filled after determination
    settlement_ts?: string;            // Settlement timestamp
    strike_type?: string;
    floor_strike?: number;
    cap_strike?: number;
    structured_target_id?: string;
}

/**
 * EventData — a real-world event containing one or more markets.
 *
 * Examples: "2024 Presidential Election", "Super Bowl LVIII", etc.
 * An event groups related markets together so they can be found and
 * displayed as a unit.
 */
export interface EventData {
    event_ticker: string;              // Unique event identifier
    series_ticker: string;             // Parent series identifier
    title: string;                     // Full event title
    sub_title: string;                 // Shortened title
    collateral_return_type: string;    // How collateral is returned
    mutually_exclusive: boolean;       // Can only one market resolve YES?
    category: string;                  // Event category
    available_on_brokers: boolean;     // Available to brokers
    product_metadata?: Record<string, unknown>;
    strike_date?: string;              // Date-based strike
    strike_period?: string;            // Period-based strike
    markets?: Market[];                // Nested markets (if requested)
}

/**
 * Order — a single buy or sell order placed by the user.
 */
export interface Order {
    order_id: string;
    ticker: string;
    client_order_id?: string;
    side: "yes" | "no";
    action: "buy" | "sell";
    type: string;
    status: string;
    yes_price: number;
    no_price: number;
    created_time: string;
    updated_time?: string;
    expiration_time?: string;
    count: number;                     // Original order quantity
    remaining_count: number;           // Unfilled contracts
    fill_count: number;                // Filled contracts
    time_in_force?: string;
    place_count: number;
    decrease_count: number;
    maker_fill_count: number;
    taker_fill_count: number;
    taker_fees: number;
    // Dollar-denominated fields
    yes_price_dollars?: string;
    no_price_dollars?: string;
    taker_fees_dollars?: string;
    maker_fees_dollars?: string;
}

/**
 * Position — the user's holding in a specific market.
 */
export interface Position {
    ticker: string;
    event_ticker: string;
    event_title?: string;
    market_title?: string;
    position: number;                  // Net contract position (positive = yes, negative = no)
    total_traded: number;              // Total contracts traded
    resting_orders_count: number;
    fees_paid: number;
    realized_pnl: number;
    market_result?: string;
    settlement_value?: number;
}

/**
 * Fill — a completed trade match.
 */
export interface Fill {
    trade_id: string;
    order_id: string;
    ticker: string;
    side: "yes" | "no";
    action: "buy" | "sell";
    count: number;
    yes_price: number;
    no_price: number;
    is_taker: boolean;
    created_time: string;
    // Dollar-denominated
    yes_price_dollars?: string;
    no_price_dollars?: string;
}

/**
 * OrderbookLevel — a single price level in the order book.
 */
export interface OrderbookLevel {
    price: number;
    quantity: number;
}

/**
 * PriceLevelDollars — dollar-denominated price level.
 */
export interface PriceLevelDollars {
    price: string;
    quantity: number;
}

/**
 * Orderbook — the full order book for a market.
 */
export interface Orderbook {
    yes: OrderbookLevel[];
    no: OrderbookLevel[];
    yes_dollars: PriceLevelDollars[];
    no_dollars: PriceLevelDollars[];
}

/**
 * ExchangeStatus — whether the exchange is open for trading.
 */
export interface ExchangeStatus {
    exchange_active: boolean;
    trading_active: boolean;
}

/**
 * Balance — the user's account balance.
 */
export interface Balance {
    balance: number;                   // Available balance in cents
    portfolio_value: number;           // Total portfolio value in cents
}

/**
 * Series — a recurring group of events (e.g. "Weekly Bitcoin Price").
 */
export interface Series {
    ticker: string;
    frequency: string;
    title: string;
    category: string;
    tags: string[];
}

/**
 * Trade — a public trade that occurred on a market.
 */
export interface Trade {
    trade_id: string;
    ticker: string;
    side: "yes" | "no";
    yes_price: number;
    no_price: number;
    count: number;
    created_time: string;
    taker_side: string;
    // Dollar-denominated
    yes_price_dollars?: string;
    no_price_dollars?: string;
}

/**
 * Candlestick — OHLC price data for a time period.
 */
export interface Candlestick {
    end_period_ts: number;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number;
    previous_price: number | null;
}

// ─── API Response Wrappers ─────────────────────────────────────
// These match the exact shape of Kalshi's JSON responses.

export interface GetEventsResponse {
    events: EventData[];
    cursor: string;
}

export interface GetEventResponse {
    event: EventData;
    markets: Market[];
}

export interface GetMarketsResponse {
    markets: Market[];
    cursor: string;
}

export interface GetMarketResponse {
    market: Market;
}

export interface GetMarketOrderbookResponse {
    orderbook: Orderbook;
}

export interface GetTradesResponse {
    trades: Trade[];
    cursor: string;
}

export interface GetMarketCandlesticksResponse {
    candlesticks: Candlestick[];
}

export interface CreateOrderRequest {
    ticker: string;                    // Market ticker
    side: "yes" | "no";               // Which side to trade
    action: "buy" | "sell";           // Buy or sell contracts
    count?: number;                    // Number of contracts (whole)
    type?: string;                     // Order type
    yes_price?: number;                // YES price in cents (1-99)
    no_price?: number;                 // NO price in cents (1-99)
    expiration_ts?: number;            // Order expiration timestamp
    time_in_force?: "fill_or_kill" | "good_till_canceled" | "immediate_or_cancel";
    buy_max_cost?: number;             // Max cost in cents (triggers FoK)
    post_only?: boolean;               // Maker-only order
    client_order_id?: string;          // Client-assigned ID for idempotency
}

export interface CreateOrderResponse {
    order: Order;
}

export interface GetOrderResponse {
    order: Order;
}

export interface GetOrdersResponse {
    orders: Order[];
    cursor: string;
}

export interface CancelOrderResponse {
    order: Order;
    reduced_by: number;
}

export interface GetBalanceResponse {
    balance: number;
    portfolio_value: number;
}

export interface GetPositionsResponse {
    market_positions: Position[];
    cursor: string;
    event_positions?: unknown[];
}

export interface GetFillsResponse {
    fills: Fill[];
    cursor: string;
}

/**
 * Settlement — a resolved market position with payout details.
 */
export interface Settlement {
    ticker: string;
    settled_time: string;
    result: string;
    revenue: number;           // cents
    no_count: number;
    yes_count: number;
}

export interface GetSettlementsResponse {
    settlements: Settlement[];
    cursor: string;
}

export interface GetExchangeStatusResponse {
    exchange_active: boolean;
    trading_active: boolean;
}

export interface GetExchangeScheduleResponse {
    schedule: {
        standard_hours: unknown;
    };
}

export interface GetEventMetadataResponse {
    image_url: string;
    featured_image_url?: string;
    market_details: Array<{
        market_ticker: string;
        image_url: string;
        color_code: string;
    }>;
    settlement_sources: Array<{
        name: string;
        url: string;
    }>;
}

export interface GetSeriesListResponse {
    series: Series[];
}

export interface GetSeriesResponse {
    series: Series;
}

export interface GetTagsByCategoriesResponse {
    categories: Record<string, string[]>;
}

export interface SearchSeriesItem {
    series_ticker: string;
    series_title: string;
    event_ticker: string;
    event_subtitle: string;
    event_title: string;
    category: string;
    tags: string[];
    total_series_volume: number;
    total_volume: number;
    total_market_count: number;
    active_market_count: number;
    markets: Market[];
    is_trending: boolean;
    is_new: boolean;
    is_closing: boolean;
    is_price_delta: boolean;
    search_score: number;
    milestone_id?: string;
}

export interface HydratedMilestone {
    id?: string;
    type?: string;
    title?: string;
    product_details?: Record<string, unknown>;
    details?: Record<string, unknown>;
}

export interface HydratedTarget {
    id?: string;
    name?: string;
    type?: string;
    details?: Record<string, unknown>;
    product_details?: Record<string, unknown>;
}

export interface HydratedData {
    milestones?: Record<string, HydratedMilestone>;
    structured_targets?: Record<string, HydratedTarget>;
}

export interface GetSearchSeriesResponse {
    total_results_count: number;
    current_page: SearchSeriesItem[];
    cursor?: string;
    hydrated_data?: HydratedData;
}

/**
 * LiveDataEntry — a single item in the live_data/batch response array.
 */
export interface LiveDataEntry {
    type: string;
    details: Record<string, unknown>;
    milestone_id: string;
}

/**
 * GetLiveDataResponse — response from the live_data/batch endpoint.
 * The API returns an array of entries under the `live_datas` key.
 */
export interface GetLiveDataResponse {
    live_datas?: LiveDataEntry[];
}
