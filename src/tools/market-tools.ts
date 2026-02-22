// ============================================
// src/tools/market-tools.ts — MCP Tools for Market Data
// ============================================
// This module defines the MCP tools that AI agents use to discover
// and analyze Kalshi prediction markets. These are READ-ONLY tools —
// they don't modify any state or spend money.
//
// Each tool is defined with:
//   1. A unique name (snake_case, matches what agents see)
//   2. A description (tells the agent WHEN and WHY to use this tool)
//   3. A Zod input schema (validates parameters from the agent)
//   4. A handler function (calls the API, formats the response)
//
// WHY ZOD FOR SCHEMAS?
// The MCP SDK uses Zod schemas to automatically generate JSON Schema
// descriptions for each tool parameter. This means agents see rich
// parameter descriptions without us writing JSON Schema by hand.
// ============================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EventsApi } from "../api/events.js";
import { MarketsApi } from "../api/markets.js";
import { ExchangeApi } from "../api/exchange.js";
import { createLogger } from "../logger.js";

const log = createLogger("MarketTools");

/**
 * Registers all market data tools on the given MCP server.
 *
 * @param server     The McpServer instance to register tools on
 * @param eventsApi  Initialized EventsApi instance
 * @param marketsApi Initialized MarketsApi instance
 * @param exchangeApi Initialized ExchangeApi instance
 */
export function registerMarketTools(
    server: McpServer,
    eventsApi: EventsApi,
    marketsApi: MarketsApi,
    exchangeApi: ExchangeApi
): void {
    log.info("Registering market data tools");

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_events
    // ─────────────────────────────────────────────────────────────
    // Lets agents discover what's currently happening on Kalshi.
    // Use case: "Show me all open prediction markets"
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_events",
        "Fetch events from Kalshi. " +
        "Returns events each containing tradeable markets. Use series_ticker " +
        "from list_series to filter by a specific series. ",
        {
            // Zod schema — each field becomes a tool parameter with its description
            status: z
                .enum(["open", "closed", "settled"])
                .optional()
                .describe("Filter by event lifecycle status. 'open' = currently active."),
            series_ticker: z
                .string()
                .optional()
                .describe("Filter to a specific series (e.g. 'KXBTC' for Bitcoin markets)."),
            limit: z
                .number()
                .min(1)
                .max(200)
                .optional()
                .describe("Max number of events to return (1-200, default 200)."),
            cursor: z
                .string()
                .optional()
                .describe("Pagination cursor from a previous response."),
        },
        async ({ status, series_ticker, limit, cursor }) => {
            log.info("Tool called: get_events", { status, series_ticker, limit });

            try {
                const result = await eventsApi.getEvents({
                    status,
                    series_ticker,
                    limit,
                    cursor,
                    with_nested_markets: true,
                });

                log.info("Tool get_events completed", { eventCount: result.events.length });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    event_count: result.events.length,
                                    has_more: !!result.cursor,
                                    cursor: result.cursor || null,
                                    events: result.events.map((e) => ({
                                        ticker: e.event_ticker,
                                        title: e.title,
                                        subtitle: e.sub_title,
                                        category: e.category,
                                        mutually_exclusive: e.mutually_exclusive,
                                        market_count: e.markets?.length ?? 0,
                                        markets: e.markets?.map((m) => ({
                                            ticker: m.ticker,
                                            title: m.yes_sub_title,
                                            status: m.status,
                                            last_price: m.last_price_dollars,
                                            yes_bid: m.yes_bid_dollars,
                                            yes_ask: m.yes_ask_dollars,
                                            volume_24h: m.volume_24h,
                                        })),
                                    })),
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool get_live_events failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_event_details
    // ─────────────────────────────────────────────────────────────
    // Deep dive into a specific event and all its markets.
    // Use case: "Tell me about the 2024 election markets"
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_event_details",
        "Get detailed information about a specific Kalshi event including " +
        "all its markets, prices, and trading data. Use this after finding " +
        "an event ticker from get_live_events.",
        {
            event_ticker: z
                .string()
                .describe("The event ticker to look up (e.g. 'KXELECTION-2024')."),
        },
        async ({ event_ticker }) => {
            log.info("Tool called: get_event_details", { event_ticker });

            try {
                const [eventResult, metadataResult] = await Promise.all([
                    eventsApi.getEvent(event_ticker),
                    eventsApi.getEventMetadata(event_ticker).catch(() => null),
                ]);

                log.info("Tool get_event_details completed", {
                    event_ticker,
                    marketsCount: eventResult.markets?.length ?? 0,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    event: {
                                        ticker: eventResult.event.event_ticker,
                                        title: eventResult.event.title,
                                        subtitle: eventResult.event.sub_title,
                                        series: eventResult.event.series_ticker,
                                        category: eventResult.event.category,
                                        mutually_exclusive: eventResult.event.mutually_exclusive,
                                    },
                                    settlement_sources: metadataResult?.settlement_sources ?? [],
                                    markets: eventResult.markets?.map((m) => ({
                                        ticker: m.ticker,
                                        yes_title: m.yes_sub_title,
                                        no_title: m.no_sub_title,
                                        status: m.status,
                                        last_price: m.last_price_dollars,
                                        yes_bid: m.yes_bid_dollars,
                                        yes_ask: m.yes_ask_dollars,
                                        no_bid: m.no_bid_dollars,
                                        no_ask: m.no_ask_dollars,
                                        volume: m.volume,
                                        volume_24h: m.volume_24h,
                                        open_interest: m.open_interest,
                                        close_time: m.close_time,
                                        rules: m.rules_primary,
                                    })),
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool get_event_details failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_market_info
    // ─────────────────────────────────────────────────────────────
    // Full details for a single market — the most granular data view.
    // Use case: "What's the current price and volume for BTC-100K?"
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_market_info",
        "Get comprehensive information about a specific market including " +
        "current prices, volume, open interest, and market rules. " +
        "The last_price reflects the market's implied probability (e.g. " +
        "0.65 = 65% chance of YES).",
        {
            ticker: z
                .string()
                .describe("Market ticker (e.g. 'BTC-100K-MAR1')."),
        },
        async ({ ticker }) => {
            log.info("Tool called: get_market_info", { ticker });

            try {
                const result = await marketsApi.getMarket(ticker);
                const m = result.market;

                log.info("Tool get_market_info completed", { ticker, status: m.status });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    ticker: m.ticker,
                                    event_ticker: m.event_ticker,
                                    type: m.market_type,
                                    yes_title: m.yes_sub_title,
                                    no_title: m.no_sub_title,
                                    status: m.status,
                                    result: m.result || "pending",
                                    pricing: {
                                        last_price: m.last_price_dollars,
                                        yes_bid: m.yes_bid_dollars,
                                        yes_ask: m.yes_ask_dollars,
                                        no_bid: m.no_bid_dollars,
                                        no_ask: m.no_ask_dollars,
                                        previous_price: m.previous_price_dollars,
                                        notional_value: m.notional_value_dollars,
                                    },
                                    activity: {
                                        volume_total: m.volume,
                                        volume_24h: m.volume_24h,
                                        open_interest: m.open_interest,
                                    },
                                    timing: {
                                        open_time: m.open_time,
                                        close_time: m.close_time,
                                        latest_expiration: m.latest_expiration_time,
                                    },
                                    rules: {
                                        primary: m.rules_primary,
                                        secondary: m.rules_secondary,
                                        can_close_early: m.can_close_early,
                                    },
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool get_market_info failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_market_orderbook
    // ─────────────────────────────────────────────────────────────
    // Shows the live supply/demand for a market at each price level.
    // Use case: "How much liquidity is available near 65¢?"
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_market_orderbook",
        "Get the live order book for a market showing buy orders on YES " +
        "and NO sides at each price level. Helps understand liquidity, " +
        "spread, and potential slippage for large orders.",
        {
            ticker: z.string().describe("Market ticker."),
            depth: z
                .number()
                .min(1)
                .max(100)
                .optional()
                .describe("Number of price levels to return (1-100). Default returns all."),
        },
        async ({ ticker, depth }) => {
            log.info("Tool called: get_market_orderbook", { ticker, depth });

            try {
                const result = await marketsApi.getMarketOrderbook(ticker, depth);

                log.info("Tool get_market_orderbook completed", { ticker });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    ticker,
                                    yes_bids: result.orderbook.yes_dollars,
                                    no_bids: result.orderbook.no_dollars,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool get_market_orderbook failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_market_stats
    // ─────────────────────────────────────────────────────────────
    // Aggregated analytics for a market — designed specifically for
    // AI agents making trading decisions.
    // Use case: "Is this market trending up? What's the sentiment?"
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_market_stats",
        "Get aggregated market statistics and sentiment indicators for a " +
        "prediction market. Includes price change, spread, volume trends, " +
        "and implied probability — designed for AI-driven trading decisions.",
        {
            ticker: z.string().describe("Market ticker to analyze."),
        },
        async ({ ticker }) => {
            log.info("Tool called: get_market_stats", { ticker });

            try {
                // Fetch market data and recent trades in parallel for speed
                const [marketResult, tradesResult] = await Promise.all([
                    marketsApi.getMarket(ticker),
                    marketsApi.getTrades({ ticker, limit: 50 }),
                ]);

                const m = marketResult.market;

                // ── Calculate derived statistics ──────────────────────
                const lastPrice = parseFloat(m.last_price_dollars || "0");
                const prevPrice = parseFloat(m.previous_price_dollars || "0");
                const priceChange = lastPrice - prevPrice;
                const priceChangePercent =
                    prevPrice > 0 ? ((priceChange / prevPrice) * 100).toFixed(2) : "N/A";

                const yesBid = parseFloat(m.yes_bid_dollars || "0");
                const yesAsk = parseFloat(m.yes_ask_dollars || "0");
                const spread = (yesAsk - yesBid).toFixed(4);

                // Implied probability is just the last YES price (in a $1 market)
                const impliedProbability = (lastPrice * 100).toFixed(1) + "%";

                // Analyze recent trade direction
                const trades = tradesResult.trades || [];
                const recentBuys = trades.filter((t) => t.taker_side === "yes").length;
                const recentSells = trades.filter((t) => t.taker_side === "no").length;
                const sentiment =
                    recentBuys > recentSells * 1.5
                        ? "BULLISH"
                        : recentSells > recentBuys * 1.5
                            ? "BEARISH"
                            : "NEUTRAL";

                log.info("Tool get_market_stats completed", {
                    ticker,
                    impliedProbability,
                    sentiment,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    ticker,
                                    title: m.yes_sub_title,
                                    status: m.status,
                                    implied_probability: impliedProbability,
                                    pricing: {
                                        last_price: m.last_price_dollars,
                                        previous_price: m.previous_price_dollars,
                                        price_change: priceChange.toFixed(4),
                                        price_change_percent: priceChangePercent + "%",
                                        yes_bid: m.yes_bid_dollars,
                                        yes_ask: m.yes_ask_dollars,
                                        spread,
                                    },
                                    volume: {
                                        total: m.volume,
                                        last_24h: m.volume_24h,
                                        open_interest: m.open_interest,
                                    },
                                    sentiment: {
                                        direction: sentiment,
                                        recent_trades_analyzed: trades.length,
                                        yes_taker_trades: recentBuys,
                                        no_taker_trades: recentSells,
                                    },
                                    timing: {
                                        close_time: m.close_time,
                                        can_close_early: m.can_close_early,
                                    },
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool get_market_stats failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_recent_trades
    // ─────────────────────────────────────────────────────────────
    // Raw trade feed showing actual executions.
    // Use case: "What trades happened in the last hour?"
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_recent_trades",
        "Get recent completed trades on Kalshi markets. Shows actual " +
        "transaction data: price, quantity, and who was the taker. " +
        "Useful for understanding real market activity and momentum.",
        {
            ticker: z
                .string()
                .optional()
                .describe("Filter to a specific market ticker. Omit for all markets."),
            limit: z
                .number()
                .min(1)
                .max(1000)
                .optional()
                .describe("Number of trades to return (1-1000, default 100)."),
        },
        async ({ ticker, limit }) => {
            log.info("Tool called: get_recent_trades", { ticker, limit });

            try {
                const result = await marketsApi.getTrades({ ticker, limit });

                log.info("Tool get_recent_trades completed", {
                    tradeCount: result.trades?.length ?? 0,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    trade_count: result.trades?.length ?? 0,
                                    trades: result.trades?.map((t) => ({
                                        trade_id: t.trade_id,
                                        ticker: t.ticker,
                                        side: t.side,
                                        taker_side: t.taker_side,
                                        price: t.yes_price_dollars || `${t.yes_price}¢`,
                                        count: t.count,
                                        time: t.created_time,
                                    })),
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool get_recent_trades failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_exchange_status
    // ─────────────────────────────────────────────────────────────
    // Quick check before any trading operation.
    // Use case: "Can I trade right now?"
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_exchange_status",
        "Check if the Kalshi exchange is currently open and accepting trades. " +
        "Always call this before attempting to place orders.",
        {},
        async () => {
            log.info("Tool called: get_exchange_status");

            try {
                const result = await exchangeApi.getStatus();

                log.info("Tool get_exchange_status completed", {
                    exchangeActive: result.exchange_active,
                    tradingActive: result.trading_active,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    exchange_active: result.exchange_active,
                                    trading_active: result.trading_active,
                                    can_trade: result.exchange_active && result.trading_active,
                                    message: result.trading_active
                                        ? "Exchange is open — trading is active."
                                        : "Exchange is currently closed or trading is paused.",
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool get_exchange_status failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    log.info("All market data tools registered (7 tools)");
}
