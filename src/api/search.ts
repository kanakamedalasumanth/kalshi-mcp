// ============================================
// src/api/search.ts — Kalshi Search API Client
// ============================================
// Wraps:
//   GET /search/tags_by_categories → tags grouped by category
//   GET /search/series             → search series with hydration
//   GET /milestones                → milestones by event ticker
//   GET /milestones/{id}           → single milestone by ID
//   GET /structured_targets/{id}   → resolve UUID to named entity
//   GET (external) /v1/live_data/batch → live game/race data

import { createLogger } from "../logger.js";
import { KalshiClient } from "../auth/client.js";
import type {
    GetTagsByCategoriesResponse,
    GetSearchSeriesResponse,
    GetLiveDataResponse,
    GetMilestoneResponse,
    GetMilestonesResponse,
    GetStructuredTargetResponse,
} from "../types/kalshi.js";

const log = createLogger("SearchAPI");

/** Parameters accepted by getSearchSeries (user-configurable subset). */
export interface SearchSeriesParams {
    category?: string;
    tag?: string;
    page_size?: number;
    cursor?: string;
}

export class SearchApi {
    private client: KalshiClient;

    constructor(client: KalshiClient) {
        this.client = client;
        log.info("Search API module initialized");
    }

    async getTagsByCategories(): Promise<GetTagsByCategoriesResponse> {
        const done = log.time("GET /search/tags_by_categories");

        const result = await this.client.get<GetTagsByCategoriesResponse>(
            "/search/tags_by_categories"
        );

        done({ categoryCount: Object.keys(result.categories ?? result).length });
        return result;
    }

    /**
     * Searches for open series on Kalshi with trending ordering and milestone hydration.
     * Fixed params (always sent): order_by=trending, status=open, with_milestones=true,
     * hydrate=milestones,structured_targets, include_sports_derivatives=true.
     */
    async getSearchSeries(params: SearchSeriesParams = {}): Promise<GetSearchSeriesResponse> {
        const done = log.time("GET /search/series");

        const result = await this.client.getPublic<GetSearchSeriesResponse>(
            "/search/series",
            {
                order_by: "trending",
                status: "open",
                with_milestones: true,
                hydrate: "milestones,structured_targets",
                include_sports_derivatives: true,
                page_size: params.page_size ?? 15,
                category: params.category,
                tag: params.tag,
                cursor: params.cursor,
            }
        );

        done({ totalResults: result.total_results_count, pageSize: result.current_page?.length });
        return result;
    }

    /**
     * Fetches milestones linked to an event ticker.
     * Uses the authenticated milestones API — direct and efficient.
     */
    async getMilestonesByEventTicker(eventTicker: string): Promise<GetMilestonesResponse> {
        const done = log.time("GET /milestones (by event_ticker)");

        const result = await this.client.get<GetMilestonesResponse>(
            "/milestones",
            {
                related_event_ticker: eventTicker,
                limit: 10,
            }
        );

        done({ eventTicker, milestoneCount: result.milestones?.length ?? 0 });
        return result;
    }

    /**
     * Fetches a single milestone by its ID.
     */
    async getMilestone(milestoneId: string): Promise<GetMilestoneResponse> {
        const done = log.time("GET /milestones/{id}");

        const result = await this.client.get<GetMilestoneResponse>(
            `/milestones/${milestoneId}`
        );

        done({ milestoneId });
        return result;
    }

    /**
     * Fetches a structured target (team, player, candidate) by ID.
     * Used to resolve UUIDs in live data to human-readable names.
     */
    async getStructuredTarget(targetId: string): Promise<GetStructuredTargetResponse> {
        const done = log.time("GET /structured_targets/{id}");

        const result = await this.client.get<GetStructuredTargetResponse>(
            `/structured_targets/${targetId}`
        );

        done({ targetId });
        return result;
    }

    /**
     * Fetches live data (scores, race results, etc.) for a set of milestone IDs.
     * Uses the public elections API via client.getPublic() — no auth required.
     * Returns an empty response on failure so callers can gracefully degrade.
     */
    async getLiveData(milestoneIds: string[]): Promise<GetLiveDataResponse> {
        if (milestoneIds.length === 0) {
            return { live_datas: [] };
        }

        const done = log.time("GET /v1/live_data/batch");

        try {
            const data = await this.client.getPublic<GetLiveDataResponse>(
                "/live_data/batch",
                { milestone_ids: milestoneIds }
            );

            done({ entryCount: data.live_datas?.length ?? 0 });
            return data;
        } catch (error) {
            log.warn("Live data fetch error — returning empty", {
                error: error instanceof Error ? error.message : String(error),
            });
            return { live_datas: [] };
        }
    }
}
