// ============================================
// src/api/search.ts — Kalshi Search API Client
// ============================================
// The Search API provides discovery helpers that make it easier to find
// content on Kalshi. Currently wraps:
//   GET /search/tags_by_categories → Tags grouped by category
//
// Useful for understanding what categories and tags exist before
// filtering series or events.
// ============================================

import { createLogger } from "../logger.js";
import { KalshiClient } from "../auth/client.js";
import type { GetTagsByCategoriesResponse, GetSearchSeriesResponse } from "../types/kalshi.js";

const log = createLogger("SearchAPI");

/**
 * SearchApi — discovery and search helpers for Kalshi content.
 *
 * Usage:
 * ```ts
 * const api = new SearchApi(client);
 * const tags = await api.getTagsByCategories();
 * // Could be { "Crypto": ["BTC", "ETH"], "Sports": ["NFL", "NBA"], ... }
 * // or a different shape — we return the raw response for flexibility.
 * ```
 */
export class SearchApi {
    private client: KalshiClient;

    constructor(client: KalshiClient) {
        this.client = client;
        log.info("Search API module initialized");
    }

    /**
     * Gets available tags grouped by series category.
     *
     * Calls the Kalshi `/search/tags_by_categories` endpoint.
     * Returns the raw API response for maximum flexibility.
     */
    async getTagsByCategories(): Promise<GetTagsByCategoriesResponse> {
        log.info("Fetching tags by categories");
        const done = log.time("GET /search/tags_by_categories");

        const result = await this.client.get<GetTagsByCategoriesResponse>(
            "/search/tags_by_categories"
        );

        const topKeys = Object.keys(result);
        done({ topKeys });
        log.info("Tags by categories fetched", {
            topLevelKeys: topKeys,
            sampleValues: Object.entries(result).slice(0, 3).map(([k, v]) => ({
                key: k,
                type: typeof v,
                isArray: Array.isArray(v),
            })),
        });

        return result;
    }

    /**
     * Searches for series and related active markets by category and tags.
     */
    async getSearchSeries(params?: {
        category?: string,
        tags?: string,
        status?: string,
        orderBy?: string | "trending" | "newest" | "volatile" | "volume" | "50-50"
    }): Promise<GetSearchSeriesResponse> {
        log.info("Fetching search series", { filters: params });
        const done = log.time(`GET /search/series`);

        const result = await this.client.get<GetSearchSeriesResponse>("/search/series", {
            category: params?.category,
            tags: params?.tags,
            status: params?.status,
            orderBy: params?.orderBy,
        });

        done({
            resultCount: result.total_results_count,
            pageCount: result.current_page?.length ?? 0
        });

        log.info("Search series fetched", {
            resultCount: result.total_results_count,
        });

        return result;
    }
}
