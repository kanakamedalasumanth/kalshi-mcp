// ============================================
// src/tools/series-tools.ts — Series MCP Tools
// ============================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SeriesApi } from "../api/series.js";
import { createLogger } from "../logger.js";

const log = createLogger("SeriesTools");

/**
 * Registers series tools on the MCP server.
 *
 * @param server    The McpServer instance to register tools on
 * @param seriesApi Initialized SeriesApi instance
 */
export function registerSeriesTools(
    server: McpServer,
    seriesApi: SeriesApi
): void {
    log.info("Registering series tools");

    // ─────────────────────────────────────────────────────────────
    // TOOL: list_series
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "list_series",
        "List available series (recurring event groups) on Kalshi. " +
        "Series are templates that spawn new events on a regular cadence " +
        "(e.g. 'Weekly Bitcoin Price', 'Daily Weather'). Use category or " +
        "tags to filter results. Series tickers can be used to filter " +
        "events or fetch candlestick data. For finding live markets by category, " +
        "prefer using search_live_markets instead.",
        {
            category: z
                .string()
                .optional()
                .describe("Filter by category (e.g. 'Crypto', 'Economics', 'Sports')."),
            tags: z
                .string()
                .optional()
                .describe("Comma-separated tags to filter by (e.g. 'bitcoin,ethereum'). Use get_search_tags to discover available tags."),
        },
        async ({ category, tags }) => {
            log.info("Tool called: list_series", { category, tags });

            try {
                const result = await seriesApi.listSeries({ category, tags });

                log.info("Tool list_series completed", {
                    seriesCount: result.series?.length ?? 0,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    series_count: result.series?.length ?? 0,
                                    series: result.series?.map((s) => ({
                                        ticker: s.ticker,
                                        title: s.title,
                                        category: s.category,
                                        frequency: s.frequency,
                                        tags: s.tags,
                                    })),
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool list_series failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_series
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_series",
        "Get detailed information about a specific Kalshi series by ticker. " +
        "Returns the series title, category, frequency, and tags. " +
        "Useful when you need metadata for a specific series ticker (e.g. 'KXBTC').",
        {
            series_ticker: z
                .string()
                .describe("The series ticker to look up (e.g. 'KXBTC')."),
        },
        async ({ series_ticker }) => {
            log.info("Tool called: get_series", { series_ticker });

            try {
                const result = await seriesApi.getSeries(series_ticker);

                log.info("Tool get_series completed", {
                    series_ticker,
                    title: result.series?.title,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    ticker: result.series.ticker,
                                    title: result.series.title,
                                    category: result.series.category,
                                    frequency: result.series.frequency,
                                    tags: result.series.tags,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool get_series failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    log.info("All series tools registered (2 tools)");
}
