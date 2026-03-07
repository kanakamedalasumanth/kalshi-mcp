// ============================================
// src/api/trading.ts — Kalshi Trading/Orders API Client
// ============================================
// Methods:
//   createOrder  — Place a new order
//   getOrder     — Get a single order by ID
//   getOrders    — List orders with optional filters
//   cancelOrder  — Cancel a resting order

import { KalshiClient } from "../auth/client.js";
import { createLogger } from "../logger.js";
import type {
    CreateOrderRequest,
    CreateOrderResponse,
    GetOrderResponse,
    GetOrdersResponse,
    CancelOrderResponse,
} from "../types/kalshi.js";

const log = createLogger("TradingAPI");

export interface GetOrdersParams {
    ticker?: string;
    event_ticker?: string;
    status?: "resting" | "canceled" | "executed";
    limit?: number;
    cursor?: string;
    min_ts?: number;
    max_ts?: number;
}

export class TradingApi {
    private client: KalshiClient;

    constructor(client: KalshiClient) {
        this.client = client;
        log.info("Trading API module initialized");
    }

    async createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
        const done = log.time("POST /portfolio/orders");
        const result = await this.client.post<CreateOrderResponse, CreateOrderRequest>(
            "/portfolio/orders",
            request
        );
        done({ orderId: result.order.order_id, status: result.order.status });
        return result;
    }

    async getOrder(orderId: string): Promise<GetOrderResponse> {
        const done = log.time(`GET /portfolio/orders/${orderId}`);
        const result = await this.client.get<GetOrderResponse>(
            `/portfolio/orders/${orderId}`
        );
        done({ status: result.order.status });
        return result;
    }

    async getOrders(params?: GetOrdersParams): Promise<GetOrdersResponse> {
        const done = log.time("GET /portfolio/orders");
        const result = await this.client.get<GetOrdersResponse>("/portfolio/orders", {
            ticker: params?.ticker,
            event_ticker: params?.event_ticker,
            status: params?.status,
            limit: params?.limit,
            cursor: params?.cursor,
            min_ts: params?.min_ts,
            max_ts: params?.max_ts,
        });
        done({ count: result.orders?.length ?? 0 });
        return result;
    }

    async cancelOrder(orderId: string): Promise<CancelOrderResponse> {
        const done = log.time(`DELETE /portfolio/orders/${orderId}`);
        const result = await this.client.delete<CancelOrderResponse>(
            `/portfolio/orders/${orderId}`
        );
        done({ reducedBy: result.reduced_by });
        return result;
    }
}
