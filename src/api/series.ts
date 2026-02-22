// ============================================
// src/api/series.ts — Kalshi Series API Client
// ============================================
// Series are recurring groups of events on Kalshi (e.g. "Weekly Bitcoin
// Price", "Daily Weather"). Each series acts as a template that spawns
// new events on a regular cadence.
//
// This module wraps:
//   GET /series                  → List/filter all series
//   GET /series/{series_ticker}  → Get a single series by ticker
// ============================================

import { KalshiClient } from "../auth/client.js";
import { createLogger } from "../logger.js";
import type {
    GetSeriesListResponse,
    GetSeriesResponse,
} from "../types/kalshi.js";

const log = createLogger("SeriesAPI");

/**
 * Optional filters when listing series.
 *
 * @property category                Filter by category (e.g. "Crypto", "Economics")
 * @property tags                    Comma-separated tags to filter by
 * @property include_product_metadata  Include extra product metadata in the response
 */
export interface GetSeriesListParams {
    category?: string;
    tags?: string;
    include_product_metadata?: boolean;
}

/**
 * SeriesApi — fetches series data from Kalshi.
 *
 * Usage:
 * ```ts
 * const api = new SeriesApi(client);
 * const { series } = await api.listSeries({ category: "Crypto" });
 * const btcSeries = await api.getSeries("KXBTC");
 * ```
 */
export class SeriesApi {
    private client: KalshiClient;

    constructor(client: KalshiClient) {
        this.client = client;
        log.info("Series API module initialized");
    }

    /**
     * Lists all series, optionally filtered by category or tags.
     */
    async listSeries(params?: GetSeriesListParams): Promise<GetSeriesListResponse> {
        log.info("Fetching series list", { filters: params });
        const done = log.time("GET /series");

        const result = await this.client.get<GetSeriesListResponse>("/series", {
            category: params?.category,
            tags: params?.tags,
            include_product_metadata: params?.include_product_metadata,
        });

        done({ seriesCount: result.series?.length ?? 0 });
        log.info("Series list fetched", {
            count: result.series?.length ?? 0,
        });

        return result;
    }

    /**
     * Gets details for a single series by ticker.
     *
     * @param seriesTicker  The series ticker (e.g. "KXBTC")
     */
    async getSeries(seriesTicker: string): Promise<GetSeriesResponse> {
        log.info("Fetching series details", { seriesTicker });
        const done = log.time(`GET /series/${seriesTicker}`);

        const result = await this.client.get<GetSeriesResponse>(
            `/series/${seriesTicker}`
        );

        done({ title: result.series?.title });
        log.info("Series details fetched", {
            seriesTicker,
            title: result.series?.title,
        });

        return result;
    }


}
