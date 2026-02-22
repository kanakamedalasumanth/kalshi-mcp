// ============================================
// src/api/portfolio.ts — Kalshi Portfolio API Client
// ============================================
// The portfolio endpoints give the user insight into their account
// state: how much cash they have, what positions they hold, what
// trades they've completed, and settlement history.
//
// Endpoints wrapped:
//   GET /portfolio/balance      → Cash balance + portfolio value
//   GET /portfolio/positions    → Current market positions
//   GET /portfolio/fills        → Trade execution history
//   GET /portfolio/settlements  → Settlement history
// ============================================

import { KalshiClient } from "../auth/client.js";
import { createLogger } from "../logger.js";
import type {
    GetBalanceResponse,
    GetPositionsResponse,
    GetFillsResponse,
    GetSettlementsResponse,
} from "../types/kalshi.js";

const log = createLogger("PortfolioAPI");

/**
 * Filters for listing positions.
 */
export interface GetPositionsParams {
    ticker?: string;
    event_ticker?: string;
    limit?: number;
    cursor?: string;
    count_filter?: string;       // "position", "total_traded"
}

/**
 * Filters for listing fills.
 */
export interface GetFillsParams {
    ticker?: string;
    order_id?: string;
    limit?: number;
    cursor?: string;
    min_ts?: number;
    max_ts?: number;
}

/**
 * PortfolioApi — queries the user's account and positions.
 *
 * Usage:
 * ```ts
 * const api = new PortfolioApi(client);
 * const balance = await api.getBalance();
 * console.log(`Available: $${balance.balance / 100}`);
 * ```
 */
export class PortfolioApi {
    private client: KalshiClient;

    constructor(client: KalshiClient) {
        this.client = client;
        log.info("Portfolio API module initialized");
    }

    /**
     * Gets the user's account balance and total portfolio value.
     *
     * Both values are returned in cents (divide by 100 for dollars).
     * - balance:         Available cash to trade
     * - portfolio_value: Total value including open positions
     */
    async getBalance(): Promise<GetBalanceResponse> {
        log.info("Fetching account balance");
        const done = log.time("GET /portfolio/balance");

        const result = await this.client.get<GetBalanceResponse>(
            "/portfolio/balance"
        );

        done({
            balanceCents: result.balance,
            portfolioValueCents: result.portfolio_value,
        });
        log.info("Balance fetched", {
            balanceDollars: (result.balance / 100).toFixed(2),
            portfolioValueDollars: (result.portfolio_value / 100).toFixed(2),
        });

        return result;
    }

    /**
     * Gets the user's current market positions.
     *
     * Each position shows:
     * - How many contracts they hold (positive = YES, negative = NO)
     * - Total contracts traded
     * - Realized P&L
     * - Whether the market has settled
     *
     * @param params  Optional filters (ticker, event, pagination)
     */
    async getPositions(params?: GetPositionsParams): Promise<GetPositionsResponse> {
        log.info("Fetching portfolio positions", { filters: params });
        const done = log.time("GET /portfolio/positions");

        const result = await this.client.get<GetPositionsResponse>(
            "/portfolio/positions",
            {
                ticker: params?.ticker,
                event_ticker: params?.event_ticker,
                limit: params?.limit,
                cursor: params?.cursor,
                count_filter: params?.count_filter,
            }
        );

        done({ positionCount: result.market_positions?.length ?? 0 });
        log.info("Positions fetched", {
            count: result.market_positions?.length ?? 0,
            hasMore: !!result.cursor,
        });

        return result;
    }

    /**
     * Gets the user's trade fill history.
     *
     * A fill occurs when your order is matched against another user's
     * order on the exchange. Each fill records the price, quantity,
     * and whether you were the maker or taker.
     *
     * @param params  Optional filters (ticker, order_id, timestamps)
     */
    async getFills(params?: GetFillsParams): Promise<GetFillsResponse> {
        log.info("Fetching trade fills", { filters: params });
        const done = log.time("GET /portfolio/fills");

        const result = await this.client.get<GetFillsResponse>(
            "/portfolio/fills",
            {
                ticker: params?.ticker,
                order_id: params?.order_id,
                limit: params?.limit,
                cursor: params?.cursor,
                min_ts: params?.min_ts,
                max_ts: params?.max_ts,
            }
        );

        done({ fillCount: result.fills?.length ?? 0 });
        log.info("Fills fetched", {
            count: result.fills?.length ?? 0,
            hasMore: !!result.cursor,
        });

        return result;
    }

    /**
     * Gets the user's settlement history.
     *
     * Settlements happen when markets expire and resolve. Each settlement
     * shows the final result and payout.
     */
    async getSettlements(params?: {
        ticker?: string;
        limit?: number;
        cursor?: string;
    }): Promise<GetSettlementsResponse> {
        log.info("Fetching settlements", { filters: params });
        const done = log.time("GET /portfolio/settlements");

        const result = await this.client.get<GetSettlementsResponse>(
            "/portfolio/settlements",
            {
                ticker: params?.ticker,
                limit: params?.limit,
                cursor: params?.cursor,
            }
        );

        done({ settlementCount: result.settlements?.length ?? 0 });
        log.info("Settlements fetched", {
            count: result.settlements?.length ?? 0,
        });

        return result;
    }
}
