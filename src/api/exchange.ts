// ============================================
// src/api/exchange.ts — Kalshi Exchange Status API Client
// ============================================
// Before placing trades, agents should check if the exchange is open.
// This module wraps:
//   GET /exchange/status    → Is the exchange open for trading?
//   GET /exchange/schedule  → Trading hours
//
// These are lightweight, unauthenticated-friendly endpoints that help
// an AI agent decide whether it's worth attempting a trade.
// ============================================

import { KalshiClient } from "../auth/client.js";
import { createLogger } from "../logger.js";
import type {
    GetExchangeStatusResponse,
    GetExchangeScheduleResponse,
} from "../types/kalshi.js";

const log = createLogger("ExchangeAPI");

/**
 * ExchangeApi — checks exchange availability and schedule.
 *
 * Usage:
 * ```ts
 * const api = new ExchangeApi(client);
 * const status = await api.getStatus();
 * if (status.trading_active) {
 *   // Safe to place orders
 * }
 * ```
 */
export class ExchangeApi {
    private client: KalshiClient;

    constructor(client: KalshiClient) {
        this.client = client;
        log.info("Exchange API module initialized");
    }

    /**
     * Gets the current exchange status.
     *
     * Returns two booleans:
     * - exchange_active: Whether the exchange is operational
     * - trading_active:  Whether trading (order placement) is allowed
     *
     * Always check this before attempting to place orders.
     */
    async getStatus(): Promise<GetExchangeStatusResponse> {
        log.info("Checking exchange status");
        const done = log.time("GET /exchange/status");

        const result = await this.client.get<GetExchangeStatusResponse>(
            "/exchange/status"
        );

        done({
            exchangeActive: result.exchange_active,
            tradingActive: result.trading_active,
        });
        log.info("Exchange status retrieved", {
            exchangeActive: result.exchange_active,
            tradingActive: result.trading_active,
        });

        return result;
    }

    /**
     * Gets the exchange trading schedule.
     *
     * Shows standard trading hours so agents can plan when to be active.
     */
    async getSchedule(): Promise<GetExchangeScheduleResponse> {
        log.info("Fetching exchange schedule");
        const done = log.time("GET /exchange/schedule");

        const result = await this.client.get<GetExchangeScheduleResponse>(
            "/exchange/schedule"
        );

        done();
        log.info("Exchange schedule retrieved");

        return result;
    }
}
