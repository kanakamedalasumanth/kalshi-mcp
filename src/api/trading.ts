// ============================================
// src/api/trading.ts — Kalshi Trading/Orders API Client
// ============================================
// This module handles order management — the transactional heart of
// the system. It wraps:
//   POST   /portfolio/orders             → Create a new order
//   GET    /portfolio/orders             → List user's orders
//   GET    /portfolio/orders/{id}        → Get a single order
//   DELETE /portfolio/orders/{id}        → Cancel an order
//
// IMPORTANT: These endpoints interact with real money. Orders are
// executed against the live Kalshi exchange (or the demo environment
// if configured). The MCP server should be clear with agents about
// the consequences of each action.
// ============================================

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

/**
 * Filters for listing orders.
 */
export interface GetOrdersParams {
    ticker?: string;
    event_ticker?: string;
    status?: "resting" | "canceled" | "executed";
    limit?: number;
    cursor?: string;
    min_ts?: number;
    max_ts?: number;
}

/**
 * TradingApi — manages orders on Kalshi.
 *
 * Usage:
 * ```ts
 * const api = new TradingApi(client);
 *
 * // Place a buy order for 10 YES contracts at 65¢
 * const order = await api.createOrder({
 *   ticker: "BTC-100K-MAR1",
 *   side: "yes",
 *   action: "buy",
 *   count: 10,
 *   yes_price: 65,
 * });
 *
 * // Cancel it
 * await api.cancelOrder(order.order.order_id);
 * ```
 */
export class TradingApi {
    private client: KalshiClient;

    constructor(client: KalshiClient) {
        this.client = client;
        log.info("Trading API module initialized");
    }

    /**
     * Creates (places) a new order on a market.
     *
     * This is where money moves. The order will be matched against the
     * exchange's order book. If no match is found immediately, the order
     * "rests" on the book until it's filled, expires, or is cancelled.
     *
     * @param request  Order parameters:
     *   - ticker:         Market to trade on
     *   - side:           "yes" or "no"
     *   - action:         "buy" or "sell"
     *   - count:          Number of contracts (whole number)
     *   - yes_price:      Price in cents for YES side (1-99)
     *   - no_price:       Price in cents for NO side (1-99)
     *   - time_in_force:  "fill_or_kill", "good_till_canceled", or "immediate_or_cancel"
     *
     * NOTE: Provide either yes_price OR no_price, not both. The other
     * is automatically calculated as (100 - price).
     */
    async createOrder(request: CreateOrderRequest): Promise<CreateOrderResponse> {
        log.info("Creating order", {
            ticker: request.ticker,
            side: request.side,
            action: request.action,
            count: request.count,
            yesPrice: request.yes_price,
            noPrice: request.no_price,
            timeInForce: request.time_in_force,
        });
        const done = log.time("POST /portfolio/orders");

        const result = await this.client.post<CreateOrderResponse>(
            "/portfolio/orders",
            request
        );

        done({
            orderId: result.order.order_id,
            status: result.order.status,
        });
        log.info("Order created successfully", {
            orderId: result.order.order_id,
            ticker: request.ticker,
            side: request.side,
            action: request.action,
            status: result.order.status,
        });

        return result;
    }

    /**
     * Gets details for a single order by its ID.
     *
     * Use this to check if an order has been filled, partially filled,
     * or is still resting.
     */
    async getOrder(orderId: string): Promise<GetOrderResponse> {
        log.info("Fetching order details", { orderId });
        const done = log.time(`GET /portfolio/orders/${orderId}`);

        const result = await this.client.get<GetOrderResponse>(
            `/portfolio/orders/${orderId}`
        );

        done({ status: result.order.status });
        log.info("Order details fetched", {
            orderId,
            status: result.order.status,
            fillCount: result.order.fill_count,
            remainingCount: result.order.remaining_count,
        });

        return result;
    }

    /**
     * Lists the user's orders with optional filters.
     *
     * @param params  Filter by ticker, event, status, or time range
     */
    async getOrders(params?: GetOrdersParams): Promise<GetOrdersResponse> {
        log.info("Fetching orders list", { filters: params });
        const done = log.time("GET /portfolio/orders");

        const result = await this.client.get<GetOrdersResponse>(
            "/portfolio/orders",
            {
                ticker: params?.ticker,
                event_ticker: params?.event_ticker,
                status: params?.status,
                limit: params?.limit,
                cursor: params?.cursor,
                min_ts: params?.min_ts,
                max_ts: params?.max_ts,
            }
        );

        done({ count: result.orders?.length ?? 0 });
        log.info("Orders list fetched", { count: result.orders?.length ?? 0 });

        return result;
    }

    /**
     * Cancels a resting order.
     *
     * If the order has been partially filled, the remaining unfilled
     * portion is cancelled. The response shows how many contracts were
     * reduced (cancelled).
     *
     * @param orderId  The order ID to cancel
     */
    async cancelOrder(orderId: string): Promise<CancelOrderResponse> {
        log.info("Cancelling order", { orderId });
        const done = log.time(`DELETE /portfolio/orders/${orderId}`);

        const result = await this.client.delete<CancelOrderResponse>(
            `/portfolio/orders/${orderId}`
        );

        done({ reducedBy: result.reduced_by });
        log.info("Order cancelled", {
            orderId,
            reducedBy: result.reduced_by,
            finalStatus: result.order.status,
        });

        return result;
    }
}
