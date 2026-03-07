// ============================================
// src/api/portfolio.ts — Kalshi Portfolio API Client
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

export interface GetPositionsParams {
    ticker?: string;
    event_ticker?: string;
    limit?: number;
    cursor?: string;
    count_filter?: string;
}

export interface GetFillsParams {
    ticker?: string;
    order_id?: string;
    limit?: number;
    cursor?: string;
    min_ts?: number;
    max_ts?: number;
}

export class PortfolioApi {
    private client: KalshiClient;

    constructor(client: KalshiClient) {
        this.client = client;
        log.info("Portfolio API module initialized");
    }

    async getBalance(): Promise<GetBalanceResponse> {
        const done = log.time("GET /portfolio/balance");
        const result = await this.client.get<GetBalanceResponse>("/portfolio/balance");
        done({ balanceCents: result.balance, portfolioValueCents: result.portfolio_value });
        return result;
    }

    async getPositions(params?: GetPositionsParams): Promise<GetPositionsResponse> {
        const done = log.time("GET /portfolio/positions");
        const result = await this.client.get<GetPositionsResponse>("/portfolio/positions", {
            ticker: params?.ticker,
            event_ticker: params?.event_ticker,
            limit: params?.limit,
            cursor: params?.cursor,
            count_filter: params?.count_filter,
        });
        done({ positionCount: result.market_positions?.length ?? 0 });
        return result;
    }

    async getFills(params?: GetFillsParams): Promise<GetFillsResponse> {
        const done = log.time("GET /portfolio/fills");
        const result = await this.client.get<GetFillsResponse>("/portfolio/fills", {
            ticker: params?.ticker,
            order_id: params?.order_id,
            limit: params?.limit,
            cursor: params?.cursor,
            min_ts: params?.min_ts,
            max_ts: params?.max_ts,
        });
        done({ fillCount: result.fills?.length ?? 0 });
        return result;
    }

    async getSettlements(params?: { ticker?: string; limit?: number; cursor?: string }): Promise<GetSettlementsResponse> {
        const done = log.time("GET /portfolio/settlements");
        const result = await this.client.get<GetSettlementsResponse>("/portfolio/settlements", {
            ticker: params?.ticker,
            limit: params?.limit,
            cursor: params?.cursor,
        });
        done({ settlementCount: result.settlements?.length ?? 0 });
        return result;
    }
}
