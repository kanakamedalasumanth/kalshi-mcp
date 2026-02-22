// ============================================
// src/api/events.ts — Kalshi Events API Client
// ============================================
// Events are the top-level containers on Kalshi. Each event represents
// a real-world occurrence (election, sports game, economic release)
// and contains one or more markets where users can trade outcomes.
//
// This module wraps the event-related REST endpoints:
//   GET /events              → List all events (with filters)
//   GET /events/{ticker}     → Get a single event with its markets
//   GET /events/{ticker}/metadata → Get settlement sources & images
// ============================================

import { KalshiClient } from "../auth/client.js";
import { createLogger } from "../logger.js";
import type {
    GetEventsResponse,
    GetEventResponse,
    GetEventMetadataResponse,
} from "../types/kalshi.js";

const log = createLogger("EventsAPI");

/**
 * Optional filters when listing events.
 *
 * @property status          Filter by lifecycle: "open", "closed", "settled"
 * @property series_ticker   Filter to a specific series (e.g. "KXBTC")
 * @property limit           Max results per page (1-200, default 200)
 * @property cursor          Pagination cursor from a previous response
 * @property with_nested_markets  Include each event's markets inline
 */
export interface GetEventsParams {
    status?: "open" | "closed" | "settled";
    series_ticker?: string;
    limit?: number;
    cursor?: string;
    with_nested_markets?: boolean;
}

/**
 * EventsApi — fetches event data from Kalshi.
 *
 * Usage:
 * ```ts
 * const api = new EventsApi(client);
 * const { events } = await api.getEvents({ status: "open", limit: 20 });
 * const event = await api.getEvent("KXELECTION-2024");
 * ```
 */
export class EventsApi {
    private client: KalshiClient;

    constructor(client: KalshiClient) {
        this.client = client;
        log.info("Events API module initialized");
    }

    /**
     * Lists events matching the given filters.
     *
     * Useful for discovering what's currently tradeable on Kalshi.
     * Use `status: "open"` to get only active events.
     * Use `with_nested_markets: true` to get markets in a single request.
     */
    async getEvents(params?: GetEventsParams): Promise<GetEventsResponse> {
        log.info("Fetching events list", { filters: params });
        const done = log.time("GET /events");

        const result = await this.client.get<GetEventsResponse>("/events", {
            status: params?.status,
            series_ticker: params?.series_ticker,
            limit: params?.limit,
            cursor: params?.cursor,
            with_nested_markets: params?.with_nested_markets,
        });

        done({ eventCount: result.events.length, hasMore: !!result.cursor });
        log.info("Events fetched successfully", {
            count: result.events.length,
            hasMore: !!result.cursor,
        });

        return result;
    }

    /**
     * Gets full details for a single event, including its markets.
     *
     * @param eventTicker  The event ticker (e.g. "KXELECTION-2024")
     * @param withNestedMarkets  If true, markets are nested inside the event object
     */
    async getEvent(
        eventTicker: string,
        withNestedMarkets: boolean = true
    ): Promise<GetEventResponse> {
        log.info("Fetching event details", { eventTicker });
        const done = log.time(`GET /events/${eventTicker}`);

        const result = await this.client.get<GetEventResponse>(
            `/events/${eventTicker}`,
            { with_nested_markets: withNestedMarkets }
        );

        done({ marketsCount: result.markets?.length ?? 0 });
        log.info("Event details fetched", {
            eventTicker,
            title: result.event.title,
            marketsCount: result.markets?.length ?? 0,
        });

        return result;
    }

    /**
     * Gets metadata for an event: settlement sources, images, and market details.
     *
     * Useful for displaying event information in a UI or understanding
     * how markets in this event will be settled.
     */
    async getEventMetadata(eventTicker: string): Promise<GetEventMetadataResponse> {
        log.info("Fetching event metadata", { eventTicker });
        const done = log.time(`GET /events/${eventTicker}/metadata`);

        const result = await this.client.get<GetEventMetadataResponse>(
            `/events/${eventTicker}/metadata`
        );

        done({ sourcesCount: result.settlement_sources?.length ?? 0 });
        log.info("Event metadata fetched", {
            eventTicker,
            imageUrl: result.image_url,
            sourcesCount: result.settlement_sources?.length ?? 0,
        });

        return result;
    }
}
