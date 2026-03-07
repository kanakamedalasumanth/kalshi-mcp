// ============================================
// src/tools/discovery-tools.ts — Discovery MCP Tools
// ============================================
// Tools registered here:
//   get_categories  — Get all categories and their tags on Kalshi
//   search_markets  — Search for open markets with live data enrichment
//   get_live_score  — Get live scores/game state for specific events

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SearchApi } from "../api/search.js";
import { createLogger } from "../logger.js";
import type { SearchSeriesItem, HydratedData } from "../types/kalshi.js";

const log = createLogger("DiscoveryTools");

// ── Field skip-lists for trimming ────────────────────────────────

/** Top-level keys to strip from hydrated milestone product_details. */
const SKIP_PRODUCT_DETAIL_KEYS = new Set([
    "player_id_mapping",
    "source_id",
    "sportradar_id",
    "sr_id",
    "opticodds_id",
    "series_to_stat_mapping",
    "series_to_stat_name_mapping",
    "product_metadata_derived",
    "product_details_derived",
    "related_event_tickers",
]);

/** Keys to strip from any object (UUIDs, images, colors). */
const SKIP_GENERIC_KEYS = new Set([
    "image_url",
    "background_color",
    "color_palette",
    "color",
    "featured_image_url",
]);

// ── Trimming helpers ─────────────────────────────────────────────

/**
 * Recursively removes unwanted keys from an object.
 * Returns a new object — does not mutate the input.
 */
function stripKeys(obj: unknown, skipSet: Set<string>): unknown {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map((item) => stripKeys(item, skipSet));
    if (typeof obj !== "object") return obj;

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (skipSet.has(key)) continue;
        result[key] = stripKeys(value, skipSet);
    }
    return result;
}

/**
 * Extracts recent_form data from product_details, keeping only the
 * useful subset (last games, injuries with limited fields).
 */
function extractRecentForm(productDetails: Record<string, unknown>): Record<string, unknown> | undefined {
    const form: Record<string, unknown> = {};

    if (productDetails.home_last_games) {
        form.home_last_games = (productDetails.home_last_games as Array<Record<string, unknown>>).map(
            (g) => ({ date: g.date, points: g.points, opponent_points: g.opponent_points, winner: g.winner })
        );
    }
    if (productDetails.away_last_games) {
        form.away_last_games = (productDetails.away_last_games as Array<Record<string, unknown>>).map(
            (g) => ({ date: g.date, points: g.points, opponent_points: g.opponent_points, winner: g.winner })
        );
    }
    if (productDetails.game_injuries) {
        const injuries: Record<string, unknown[]> = {};
        for (const [team, list] of Object.entries(productDetails.game_injuries as Record<string, Array<Record<string, unknown>>>)) {
            injuries[team] = list.map((inj) => ({
                status: inj.status,
                description: inj.description,
                comment: inj.comment,
            }));
        }
        form.game_injuries = injuries;
    }

    return Object.keys(form).length > 0 ? form : undefined;
}

/**
 * Extracts team/candidate info from structured_targets, keeping only
 * essential identification and standing fields.
 */
function extractTeams(targets: Record<string, unknown>[]): Array<Record<string, unknown>> | undefined {
    if (!targets || targets.length === 0) return undefined;

    const allSkip = new Set([...SKIP_GENERIC_KEYS, ...SKIP_PRODUCT_DETAIL_KEYS]);

    return targets.map((t) => {
        const cleaned = stripKeys(t, allSkip) as Record<string, unknown>;
        // If season_standings exists, keep only wins/losses/rank
        if (cleaned.season_standings && typeof cleaned.season_standings === "object") {
            const s = cleaned.season_standings as Record<string, unknown>;
            cleaned.season_standings = { wins: s.wins, losses: s.losses, rank: s.rank };
        }
        return cleaned;
    });
}

/**
yes_subtitle =
'Portland'
 * Builds one trimmed output item from a SearchSeriesItem, its hydrated data,
 * and optional live state keyed by milestone_id.
 */
function buildOutputItem(
    item: SearchSeriesItem,
    hydratedData: HydratedData | undefined,
    liveDataMap: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
    const output: Record<string, unknown> = {
        event_ticker: item.event_ticker,
        milestone_id: item.milestone_id,
        event_title: item.event_title,
        category: item.category,
        tags: item.tags ?? [],
        total_volume: item.total_volume,
        markets: (item.markets ?? []).map((m) => ({
            no_subtitle: m.no_subtitle,
            yes_subtitle: m.yes_subtitle,
            ticker: m.ticker,
            yes_bid: m.yes_bid,
            yes_ask: m.yes_ask,
            last_price: m.last_price,
            price_delta: m.last_price - m.previous_price,
            volume: m.volume
        })),
    };

    // Hydrated milestone data
    const milestoneId = item.milestone_id;
    if (milestoneId && hydratedData?.milestones?.[milestoneId]?.product_details) {
        const pd = hydratedData.milestones[milestoneId].product_details as Record<string, unknown>;
        // Strip noisy keys before extracting
        const cleaned = stripKeys(pd, new Set([...SKIP_PRODUCT_DETAIL_KEYS, ...SKIP_GENERIC_KEYS])) as Record<string, unknown>;
        const recentForm = extractRecentForm(cleaned);
        if (recentForm) {
            output.recent_form = recentForm;
        }
        // Include team_leaders if present (useful for analysis)
        if (cleaned.team_leaders) {
            output.team_leaders = cleaned.team_leaders;
        }
    }

    // Structured targets(teams / candidates)
    if (hydratedData?.structured_targets) {
        const teams = extractTeams(Object.values(hydratedData.structured_targets) as Record<string, unknown>[]);
        if (teams) {
            output.teams = teams;
        }
    }

    // Live state from the batch endpoint
    let liveState: Record<string, unknown> | undefined;
    if (milestoneId && liveDataMap[milestoneId]) {
        liveState = stripKeys(liveDataMap[milestoneId], SKIP_GENERIC_KEYS) as Record<string, unknown>;
        output.live_info = liveState;
    }

    // Resolve candidate UUIDs to names for political races
    if (liveState?.type === "political_race" && liveState.candidates) {
        const targets = hydratedData?.structured_targets as Record<string, { name?: string }> | undefined;
        if (targets && !Array.isArray(targets)) {
            const rawCandidates = liveState.candidates as Record<string, unknown>;
            liveState.candidates = Object.fromEntries(
                Object.entries(rawCandidates)
                    .map(([uuid, data]) => [targets[uuid]?.name, data] as const)
                    .filter(([name]) => !!name)
            );
        }
    }

    return output;
}

// ── Tool registration ────────────────────────────────────────────

export function registerDiscoveryTools(
    server: McpServer,
    searchApi: SearchApi
): void {
    log.info("Registering discovery tools");

    // ── get_categories ───────────────────────────────────────────
    server.tool(
        "get_categories",
        "Get all available categories and their tags on Kalshi (e.g. Sports, Crypto, Politics). " +
        "Use this to understand what categories and tags exist before searching for markets.",
        {},
        async () => {
            log.info("Tool called: get_categories");
            try {
                const result = await searchApi.getTagsByCategories();
                // The API returns either { categories: {...} } or the map directly
                const categories = result.categories ?? result;
                log.info("Tool get_categories completed", { categoryCount: Object.keys(categories).length });
                return {
                    content: [{ type: "text" as const, text: JSON.stringify(categories, null, 2) }],
                };
            } catch (error) {
                log.error("Tool get_categories failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ── search_markets ───────────────────────────────────────────
    server.tool(
        "search_markets",
        "Search for open markets/ live markets on Kalshi by category or tag. Returns enriched results with live game scores " +
        "(for sports) and team/candidate context. Defaults: trending, open, page_size=15.",
        {
            category: z.string().optional().describe('e.g. "Sports", "Politics", "Crypto"'),
            tag: z.string().optional().describe('e.g. "Basketball", "Soccer", "AI"'),
            page_size: z.number().optional().describe("Number of results per page (default 15)"),
            cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        },
        async (params) => {
            log.info("Tool called: search_markets", {
                category: params.category,
                tag: params.tag,
                page_size: params.page_size,
            });

            try {
                // 1. Fetch search results with hydrated milestones
                const searchResult = await searchApi.getSearchSeries({
                    category: params.category,
                    tag: params.tag,
                    page_size: params.page_size,
                    cursor: params.cursor,
                });

                const items = searchResult.current_page ?? [];

                // 2. Collect milestone IDs for the live data fetch
                const milestoneIds = items
                    .map((item) => item.milestone_id)
                    .filter((id): id is string => id != null && id !== "");

                // 3. Fetch live data and convert array response to milestone-keyed map
                const liveDataMap: Record<string, Record<string, unknown>> = {};
                if (milestoneIds.length > 0) {
                    const liveRaw = await searchApi.getLiveData(milestoneIds);
                    for (const entry of liveRaw.live_datas ?? []) {
                        if (entry.milestone_id) {
                            liveDataMap[entry.milestone_id] = { type: entry.type, ...entry.details };
                        }
                    }
                }

                // 4. Build trimmed output
                const outputItems = items.map((item) =>
                    buildOutputItem(item, searchResult.hydrated_data, liveDataMap)
                );

                const output = {
                    total_results_count: searchResult.total_results_count,
                    next_cursor: searchResult.cursor,
                    items: outputItems,
                };

                log.info("Tool search_markets completed", {
                    totalResults: searchResult.total_results_count,
                    returnedItems: outputItems.length,
                    milestonesFetched: milestoneIds.length,
                });

                return {
                    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
                };
            } catch (error) {
                log.error("Tool search_markets failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    // ── get_live_score ─────────────────────────────────────────
    server.tool(
        "get_live_score",
        "Get live scores, game state, or race results for specific Kalshi events. " +
        "Provide milestone_ids (from a previous search_markets call) or an event_ticker to look up. " +
        "Returns real-time game scores for sports, election results for politics, etc.",
        {
            milestone_ids: z.array(z.string()).optional().describe(
                "Milestone IDs from a previous search_markets result (preferred — fastest)"
            ),
            event_ticker: z.string().optional().describe(
                "Event ticker to look up (e.g. 'NBA-LAL-BOS-2026MAR07'). Will search for the milestone automatically."
            ),
        },
        async (params) => {
            log.info("Tool called: get_live_score", {
                milestone_ids: params.milestone_ids,
                event_ticker: params.event_ticker,
            });

            try {
                // Validate at least one param is provided
                if (!params.milestone_ids?.length && !params.event_ticker) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: "Error: Provide either milestone_ids or event_ticker",
                        }],
                        isError: true,
                    };
                }

                let milestoneIds: string[] = params.milestone_ids ?? [];
                let eventInfo: Record<string, unknown> | undefined;

                // If event_ticker provided, resolve the milestone_id via milestones API
                if (params.event_ticker && milestoneIds.length === 0) {
                    const milestoneResult = await searchApi.getMilestonesByEventTicker(params.event_ticker);
                    const milestones = milestoneResult.milestones ?? [];

                    if (milestones.length === 0) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: `No milestones found for event ticker: ${params.event_ticker}`,
                            }],
                            isError: true,
                        };
                    }

                    milestoneIds = milestones.map((m) => m.id);
                    eventInfo = {
                        event_ticker: params.event_ticker,
                        milestones: milestones.map((m) => ({
                            id: m.id,
                            title: m.title,
                            type: m.type,
                            category: m.category,
                            start_date: m.start_date,
                            end_date: m.end_date,
                        })),
                    };
                }

                if (milestoneIds.length === 0) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: "No milestone_id found for this event. The event may not have live score tracking.",
                        }],
                        isError: true,
                    };
                }

                // Fetch live data for the resolved milestone IDs
                const liveRaw = await searchApi.getLiveData(milestoneIds);

                // 1. Collect all potential structured target UUIDs from live data
                const targetIds = new Set<string>();
                for (const entry of liveRaw.live_datas ?? []) {
                    // Political races: candidates keyed by UUID
                    if (entry.details?.candidates && typeof entry.details.candidates === "object") {
                        for (const key of Object.keys(entry.details.candidates as Record<string, unknown>)) {
                            targetIds.add(key);
                        }
                    }
                    // Sports: home/away team structured target IDs
                    if (entry.details?.home_team_id && typeof entry.details.home_team_id === "string") {
                        targetIds.add(entry.details.home_team_id as string);
                    }
                    if (entry.details?.away_team_id && typeof entry.details.away_team_id === "string") {
                        targetIds.add(entry.details.away_team_id as string);
                    }
                }

                // 2. Resolve UUIDs to names via structured targets API
                const nameMap: Record<string, string> = {};
                if (targetIds.size > 0) {
                    const results = await Promise.allSettled(
                        [...targetIds].map((id) => searchApi.getStructuredTarget(id))
                    );
                    for (const result of results) {
                        if (result.status === "fulfilled" && result.value.structured_target) {
                            const t = result.value.structured_target;
                            nameMap[t.id] = t.name;
                        }
                    }
                }

                // 3. Build results with resolved names
                const liveResults: Record<string, unknown>[] = [];
                for (const entry of liveRaw.live_datas ?? []) {
                    const liveEntry: Record<string, unknown> = {
                        milestone_id: entry.milestone_id,
                        type: entry.type,
                        ...entry.details,
                    };

                    // Strip noisy display-only keys
                    const cleaned = stripKeys(liveEntry, SKIP_GENERIC_KEYS) as Record<string, unknown>;

                    // Resolve candidate UUIDs to names for political races
                    if (cleaned.candidates && typeof cleaned.candidates === "object") {
                        const rawCandidates = cleaned.candidates as Record<string, unknown>;
                        cleaned.candidates = Object.fromEntries(
                            Object.entries(rawCandidates)
                                .map(([uuid, data]) => [nameMap[uuid] ?? uuid, data] as const)
                        );
                    }

                    // Resolve team IDs to names for sports
                    if (cleaned.home_team_id && nameMap[cleaned.home_team_id as string]) {
                        cleaned.home_team = nameMap[cleaned.home_team_id as string];
                    }
                    if (cleaned.away_team_id && nameMap[cleaned.away_team_id as string]) {
                        cleaned.away_team = nameMap[cleaned.away_team_id as string];
                    }

                    liveResults.push(cleaned);
                }

                const output: Record<string, unknown> = {
                    live_scores: liveResults,
                };
                if (eventInfo) {
                    output.event = eventInfo;
                }

                log.info("Tool get_live_score completed", {
                    milestoneCount: milestoneIds.length,
                    liveResultCount: liveResults.length,
                });

                return {
                    content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
                };
            } catch (error) {
                log.error("Tool get_live_score failed", { error: String(error) });
                return {
                    content: [{ type: "text" as const, text: `Error: ${String(error)}` }],
                    isError: true,
                };
            }
        }
    );

    log.info("Discovery tools registered (3 tools)");
}
