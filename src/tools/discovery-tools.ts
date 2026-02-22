// ============================================
// src/tools/discovery-tools.ts — Discovery & Search MCP Tools
// ============================================
// These tools help agents discover what's available on Kalshi —
// understanding categories and finding tags.
//
// Tools registered here:
//   get_search_tags  — Get available tags grouped by category
// ============================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SearchApi } from "../api/search.js";
import { createLogger } from "../logger.js";

const log = createLogger("DiscoveryTools");

/**
 * Registers discovery and search tools on the MCP server.
 *
 * @param server    The McpServer instance to register tools on
 * @param searchApi Initialized SearchApi instance
 */
export function registerDiscoveryTools(
    server: McpServer,
    searchApi: SearchApi
): void {
    log.info("Registering discovery tools");

    // ─────────────────────────────────────────────────────────────
    // TOOL: get_search_tags
    // ─────────────────────────────────────────────────────────────
    // Step 1: Discover available categories and tags for filtering.
    // Use case: "What categories and tags can I filter by? "
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "get_search_tags",
        "Get available categories and tags on Kalshi. " +
        "Returns a map of categories (e.g. Sports, Crypto, Economics) to their tags. " +
        "Use these to understand what categories and tags exist before filtering " +
        "with list_series or search_live_markets.",
        {},
        async () => {
            log.info("Tool called: get_search_tags");

            try {
                const result = await searchApi.getTagsByCategories();

                log.info("Tool get_search_tags completed", {
                    topLevelKeys: Object.keys(result),
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool get_search_tags failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ─────────────────────────────────────────────────────────────
    // TOOL: search_series
    // ─────────────────────────────────────────────────────────────
    // Search for series and related active markets.
    // Use case: "Find live markets for crypto" or "Get current politics games"
    // ─────────────────────────────────────────────────────────────
    server.tool(
        "search_series",
        "Search for series and related active markets by category and tags on Kalshi. " +
        "This is the primary way to check current live games, politics, or any other live events, " +
        "and get market data needed for placing orders.",
        {
            category: z.string().optional().describe("Filter by category (e.g. 'Climate and Weather' ,'Companies', 'Politics', 'Sports')"),
            tags: z.string().optional().describe("Comma-separated tags to filter by (e.g. 'Soccer,Basketball,AI,Space,Politicians')"),
            status: z.string().optional().describe("Filter by status (e.g. 'open', 'closed', 'unopened')"),
            orderBy: z.string().optional().describe("Optional sorting: 'trending', 'newest', 'volatile', 'volume', '50-50'"),
        },
        async ({ category, tags, status, orderBy }) => {
            log.info("Tool called: search_series", { category, tags, status, orderBy });

            try {
                const result = await searchApi.getSearchSeries({ category, tags, status, orderBy });

                log.info("Tool search_series completed", {
                    resultCount: result.total_results_count,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                log.error("Tool search_series failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    log.info("All discovery tools registered (2 tools)");
}
