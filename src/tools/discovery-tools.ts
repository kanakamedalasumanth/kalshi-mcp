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
        `
            Use this tool ONLY when the user explicitly asks what categories or tags are available on Kalshi,
            or when the agent needs to validate category/tag values before applying filters.
            Do NOT call this for normal "show me live markets" requests.
        `,
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
        `
        Search Kalshi series and related active markets. 
        Category and tags are OPTIONAL — do NOT require the user to know them. 
        Default behavior (when no filters are provided): return globally trending OPEN series/markets 
        so the agent can show what's live right now. 
        Use category/tags only when the user asks for a specific domain (e.g., sports, crypto, politics) 
        or wants narrower results. 
        If the user asks what categories/tags exist, call get_search_tags. 
        Returns series metadata plus active market references needed to fetch market details and place orders.
        `,
        {
            category: z.string().optional().describe("Filter by category (e.g. 'Climate and Weather' ,'Companies', 'Politics', 'Sports')"),
            tags: z.string().optional().describe("Filter by tags. e.g: Basketball,Football"),
            status: z.enum(["open", "closed", "unopened", "settled"]).optional().describe("Defaults to 'open' to show live markets."),
            orderBy: z.enum(["trending", "newest", "volatile", "volume", "50-50"])
                .optional()
                .describe("Sorting preference. Defaults to 'trending'."),
            page_size: z.number().optional().describe("Maximum number of series to return. Defaults to 20."),
        },
        async ({ category, tags, status, orderBy, page_size }) => {
            log.info("Tool called: search_series", { category, tags, status, orderBy, page_size });

            try {
                const result = await searchApi.getSearchSeries({ category, tags, status, orderBy, page_size });

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
