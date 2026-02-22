// ============================================
// src/tools/composite-tools.ts — High-Level Composite MCP Tools
// ============================================
// These tools combine multiple API calls into a single MCP tool call,
// making it easier for agents to accomplish common workflows.
//
// Tools registered here:
//   search_live_markets — Find all live events by category/tag in one call
// ============================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SeriesApi } from "../api/series.js";
import { EventsApi } from "../api/events.js";
import { TtlCache } from "../utils/cache.js";
import { createLogger } from "../logger.js";
import type { GetEventsResponse } from "../types/kalshi.js";

const log = createLogger("CompositeTools");

// Cache events by series_ticker for 2 minutes to avoid redundant API calls
const eventsCache = new TtlCache<GetEventsResponse>(60 * 1000);

/**
 * Registers composite (high-level) tools on the MCP server.
 *
 * @param server    The McpServer instance
 * @param seriesApi Initialized SeriesApi instance
 * @param eventsApi Initialized EventsApi instance
 */
export function registerCompositeTools(
    server: McpServer,
    seriesApi: SeriesApi,
    eventsApi: EventsApi
): void {
    log.info("Registering composite tools");

    // ─────────────────────────────────────────────────────────────
    // TOOL: search_live_markets
    // ─────────────────────────────────────────────────────────────
    // One-call discovery: category/tag → series → live events.
    // Internally does parallel fetches with caching.
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "search_live_markets",
        "Find all live prediction markets by category and/or tag in a single call. " +
        "This is the fastest way to discover tradeable markets. " +
        "Internally fetches series for the category, then parallel-fetches " +
        "live events for each series with caching. " +
        "Example: search_live_markets(category='Sports', tag='Basketball') " +
        "returns all live basketball markets ready for analysis.",
        {
            category: z
                .string()
                .optional()
                .describe(
                    "Filter by category (e.g. 'Sports', 'Crypto', 'Economics', 'Politics'). " +
                    "Use get_search_tags to discover available categories."
                ),
            tag: z
                .string()
                .optional()
                .describe(
                    "Filter by tag within the category (e.g. 'Basketball', 'BTC', 'Fed'). " +
                    "Use get_search_tags to discover available tags."
                ),
            status: z
                .enum(["open", "closed", "settled"])
                .optional()
                .default("open")
                .describe("Event status filter. Defaults to 'open' for live markets."),
        },
        async ({ category, tag, status }) => {
            log.info("Tool called: search_live_markets", { category, tag, status });

            try {
                // ── Step 1: Get series tickers for this category/tag ──
                const seriesResult = await seriesApi.listSeries({
                    category,
                    tags: tag,
                });

                const seriesList = seriesResult.series ?? [];
                log.info("Series fetched for composite search", {
                    category,
                    tag,
                    seriesCount: seriesList.length,
                });

                if (seriesList.length === 0) {
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: JSON.stringify(
                                    {
                                        message: `No series found for category='${category ?? "any"}' tag='${tag ?? "any"}'`,
                                        event_count: 0,
                                        events: [],
                                    },
                                    null,
                                    2
                                ),
                            },
                        ],
                    };
                }

                // ── Step 2: Parallel-fetch events for each series (with cache) ──
                const eventPromises = seriesList.map(async (series) => {
                    const cacheKey = `${series.ticker}:${status ?? "open"}`;

                    // Check cache first
                    const cached = eventsCache.get(cacheKey);
                    if (cached) {
                        log.debug("Events cache hit", { seriesTicker: series.ticker });
                        return cached;
                    }

                    // Fetch from API
                    const result = await eventsApi.getEvents({
                        series_ticker: series.ticker,
                        status: status ?? "open",
                        with_nested_markets: true,
                        limit: 200,
                    });

                    // Store in cache
                    eventsCache.set(cacheKey, result);
                    return result;
                });

                const allResults = await Promise.all(eventPromises);

                // ── Step 3: Flatten and format results ──
                const allEvents = allResults.flatMap((r) => r.events ?? []);

                log.info("Composite search completed", {
                    category,
                    tag,
                    seriesSearched: seriesList.length,
                    totalEvents: allEvents.length,
                    cacheSize: eventsCache.size,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    category: category ?? "all",
                                    tag: tag ?? "all",
                                    series_searched: seriesList.length,
                                    event_count: allEvents.length,
                                    events: allEvents.map((e) => ({
                                        event_ticker: e.event_ticker,
                                        series_ticker: e.series_ticker,
                                        title: e.title,
                                        subtitle: e.sub_title,
                                        category: e.category,
                                        market_count: e.markets?.length ?? 0,
                                        markets: e.markets?.map((m) => ({
                                            ticker: m.ticker,
                                            title: m.yes_sub_title,
                                            status: m.status,
                                            last_price: m.last_price_dollars,
                                            yes_bid: m.yes_bid_dollars,
                                            yes_ask: m.yes_ask_dollars,
                                            volume_24h: m.volume_24h,
                                            open_interest: m.open_interest,
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
                log.error("Tool search_live_markets failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    log.info("All composite tools registered (1 tool)");
}
