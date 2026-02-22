// ============================================
// src/api/markets.ts — Kalshi Markets API Client
// ============================================
// Markets are the individual tradeable contracts on Kalshi. Each market
// poses a yes/no question with a specific expiration. This module
// handles:
//   GET /markets/{ticker}              → Single market details
//   GET /markets/{ticker}/orderbook    → Live order book
//   GET /series/{s}/markets/{t}/candlesticks → Historical price data
//   GET /markets/trades                → Public trade feed
//
// These endpoints are the core of the "pull live data & analyze
// sentiment" use case.
// ============================================

import { KalshiClient } from "../auth/client.js";
import { createLogger } from "../logger.js";
import type {
    GetMarketResponse,
    GetMarketOrderbookResponse,
    GetMarketCandlesticksResponse,
    GetTradesResponse,
    GetMarketsResponse,
} from "../types/kalshi.js";

const log = createLogger("MarketsAPI");

/**
 * Filters for the public trade feed.
 */
export interface GetTradesParams {
    ticker?: string;
    limit?: number;
    cursor?: string;
    min_ts?: number;
    max_ts?: number;
}

/**
 * MarketsApi — fetches market data, order books, price history, and trades.
 *
 * Usage:
 * ```ts
 * const api = new MarketsApi(client);
 * const market = await api.getMarket("BTC-100K-MAR1");
 * const orderbook = await api.getMarketOrderbook("BTC-100K-MAR1");
 * ```
 */
export class MarketsApi {
    private client: KalshiClient;

    constructor(client: KalshiClient) {
        this.client = client;
        log.info("Markets API module initialized");
    }

    /**
     * Gets full details for a single market.
     *
     * Returns everything: prices, volume, open interest, rules, lifecycle
     * status, and settlement information. This is the go-to endpoint for
     * understanding a specific market.
     *
     * @param ticker  Market ticker (e.g. "BTC-100K-MAR1")
     */
    async getMarket(ticker: string): Promise<GetMarketResponse> {
        log.info("Fetching market details", { ticker });
        const done = log.time(`GET /markets/${ticker}`);

        const result = await this.client.get<GetMarketResponse>(`/markets/${ticker}`);

        done({ status: result.market.status });
        log.info("Market details fetched", {
            ticker,
            status: result.market.status,
            lastPrice: result.market.last_price_dollars,
            volume24h: result.market.volume_24h,
        });

        return result;
    }

    /**
     * Gets markets by event ticker.
     *
     * @param eventTicker  The parent event ticker
     * @param limit        Max results (default 100)
     */
    async getMarkets(params?: {
        event_ticker?: string;
        tickers?: string;
        limit?: number;
        cursor?: string;
    }): Promise<GetMarketsResponse> {
        log.info("Fetching markets list", { filters: params });
        const done = log.time("GET /markets");

        const result = await this.client.get<GetMarketsResponse>("/markets", {
            event_ticker: params?.event_ticker,
            tickers: params?.tickers,
            limit: params?.limit,
            cursor: params?.cursor,
        });

        done({ count: result.markets.length });
        log.info("Markets list fetched", { count: result.markets.length });

        return result;
    }

    /**
     * Gets the current order book for a market.
     *
     * The order book shows active buy orders on both YES and NO sides.
     * In binary markets, a YES bid at price X is equivalent to a NO ask
     * at price (100-X).
     *
     * @param ticker  Market ticker
     * @param depth   Number of price levels (0 = all levels, 1-100)
     */
    async getMarketOrderbook(
        ticker: string,
        depth?: number
    ): Promise<GetMarketOrderbookResponse> {
        log.info("Fetching market orderbook", { ticker, depth });
        const done = log.time(`GET /markets/${ticker}/orderbook`);

        const result = await this.client.get<GetMarketOrderbookResponse>(
            `/markets/${ticker}/orderbook`,
            { depth }
        );

        done({
            yesLevels: result.orderbook.yes?.length ?? 0,
            noLevels: result.orderbook.no?.length ?? 0,
        });
        log.info("Orderbook fetched", {
            ticker,
            yesLevels: result.orderbook.yes?.length ?? 0,
            noLevels: result.orderbook.no?.length ?? 0,
        });

        return result;
    }

    /**
     * Gets historical candlestick (OHLC) data for a market.
     *
     * Useful for price history analysis and trend identification.
     *
     * @param seriesTicker    Series ticker (parent series of the market)
     * @param ticker          Market ticker
     * @param startTs         Start Unix timestamp
     * @param endTs           End Unix timestamp
     * @param periodInterval  Candle period: 1 (minute), 60 (hour), 1440 (day)
     */
    async getMarketCandlesticks(
        seriesTicker: string,
        ticker: string,
        startTs: number,
        endTs: number,
        periodInterval: 1 | 60 | 1440
    ): Promise<GetMarketCandlesticksResponse> {
        log.info("Fetching market candlesticks", {
            seriesTicker,
            ticker,
            startTs,
            endTs,
            periodInterval,
        });
        const done = log.time(`GET candlesticks for ${ticker}`);

        const result = await this.client.get<GetMarketCandlesticksResponse>(
            `/series/${seriesTicker}/markets/${ticker}/candlesticks`,
            {
                start_ts: startTs,
                end_ts: endTs,
                period_interval: periodInterval,
            }
        );

        done({ candleCount: result.candlesticks?.length ?? 0 });
        log.info("Candlesticks fetched", {
            ticker,
            count: result.candlesticks?.length ?? 0,
        });

        return result;
    }

    /**
     * Gets recent public trades across all markets or for a specific ticker.
     *
     * Each trade shows what price and quantity was matched, useful for
     * understanding market activity and momentum.
     *
     * @param params  Optional filters (ticker, limit, timestamps)
     */
    async getTrades(params?: GetTradesParams): Promise<GetTradesResponse> {
        log.info("Fetching public trades", { filters: params });
        const done = log.time("GET /markets/trades");

        const result = await this.client.get<GetTradesResponse>("/markets/trades", {
            ticker: params?.ticker,
            limit: params?.limit,
            cursor: params?.cursor,
            min_ts: params?.min_ts,
            max_ts: params?.max_ts,
        });

        done({ tradeCount: result.trades?.length ?? 0 });
        log.info("Trades fetched", { count: result.trades?.length ?? 0 });

        return result;
    }
}
