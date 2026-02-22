// ============================================
// src/auth/client.ts — Authenticated HTTP Client for Kalshi API
// ============================================
// Wraps the native fetch() with automatic RSA signature injection.
// Every request is:
//   1. Signed using the KalshiSigner (adds 3 auth headers)
//   2. Sent with the correct Content-Type and Accept headers
//   3. Logged at debug level (method, path, status, duration)
//   4. Parsed from JSON with error handling
//
// WHY A CUSTOM CLIENT INSTEAD OF AXIOS/GOT?
// Node 18+ includes native fetch(). By wrapping it directly we avoid
// adding another dependency. The client is thin — it just signs, sends,
// logs, and parses.
// ============================================

import { KalshiSigner } from "./signer.js";
import { createLogger } from "../logger.js";

const log = createLogger("KalshiClient");

/**
 * Standard error shape returned by Kalshi on 4xx/5xx responses.
 */
export interface KalshiApiError {
    code: string;
    message: string;
    status: number;
}

/**
 * KalshiClient — HTTP client that auto-signs every request.
 *
 * Usage:
 * ```ts
 * const client = new KalshiClient(config.baseUrl, signer);
 * const events = await client.get<GetEventsResponse>("/events");
 * const order  = await client.post<CreateOrderResponse>("/portfolio/orders", body);
 * ```
 */
export class KalshiClient {
    private baseUrl: string;
    private publicBaseUrl: string;
    private signer: KalshiSigner;

    /**
     * @param baseUrl Full base URL including /trade-api/v2
     *                (e.g. "https://api.elections.kalshi.com/trade-api/v2")
     * @param signer  A KalshiSigner instance configured with your API key
     */
    constructor(baseUrl: string, publicBaseUrl: string, signer: KalshiSigner) {
        this.baseUrl = baseUrl.replace(/\/$/, ""); // Strip trailing slash
        this.signer = signer;
        this.publicBaseUrl = publicBaseUrl.replace(/\/$/, ""); // Strip trailing slash
        log.info("HTTP client initialized", { baseUrl: this.baseUrl });
    }

    // ── Public convenience methods ───────────────────────────────

    /**
     * Sends a GET request.
     * @param path   API path after the base URL (e.g. "/events")
     * @param params Optional query parameters as key-value pairs
     */
    async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
        const url = this.buildUrl(path, params);
        return this.request<T>("GET", url, path);
    }

    /**
    * Sends a GET request.
    * @param path   API path after the base URL (e.g. "/events")
    * @param params Optional query parameters as key-value pairs
    */
    async getPublic<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
        const url = this.buildUrl(path, params, true);
        return this.request<T>("GET", url, path, undefined, true);
    }

    /**
     * Sends a POST request with a JSON body.
     * @param path  API path (e.g. "/portfolio/orders")
     * @param body  Request body — will be JSON-serialized
     *
     * Two generics:
     *   T = response type (what comes back)
     *   B = body type    (what you send)
     *
     * Example:
     *   client.post<CreateOrderResponse, CreateOrderRequest>("/portfolio/orders", orderReq)
     */
    async post<T, B = unknown>(path: string, body?: B): Promise<T> {
        const url = this.buildUrl(path);
        return this.request<T>("POST", url, path, body);
    }

    /**
     * Sends a PUT request with a JSON body.
     */
    async put<T, B = unknown>(path: string, body?: B): Promise<T> {
        const url = this.buildUrl(path);
        return this.request<T>("PUT", url, path, body);
    }

    /**
     * Sends a DELETE request.
     */
    async delete<T>(path: string): Promise<T> {
        const url = this.buildUrl(path);
        return this.request<T>("DELETE", url, path);
    }

    // ── Internal ─────────────────────────────────────────────────

    /**
     * Core request method — signs the request, sends it, logs everything,
     * and parses the JSON response.
     *
     * @param method  HTTP method
     * @param url     Fully-qualified URL (base + path + query params)
     * @param path    Just the path portion (used for signing)
     * @param body    Optional request body
     * @returns       Parsed JSON response typed as T
     * @throws        Error with Kalshi's error message on non-2xx responses
     */
    private async request<T>(
        method: string,
        url: string,
        path: string,
        body?: unknown,  // unknown here is fine — this is the internal dispatcher,
        //   the public methods (post/put) enforce types via generics,
        isPublicUrl: boolean = false
    ): Promise<T> {
        // The signer needs the path as it appears in the URL (including /trade-api/v2)
        // Kalshi expects the full path from the root for signing
        const signingPath = new URL(url).pathname;
        const authHeaders = isPublicUrl ? {} : this.signer.sign(method, signingPath);

        // Start timing for the log
        const done = log.time(`${method} ${path}`);

        log.debug("Sending request", {
            method,
            path,
            hasBody: !!body,
        });

        try {
            const response = await fetch(url, {
                method,
                headers: {
                    ...authHeaders,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                // Only include body for methods that support it
                body: body ? JSON.stringify(body) : undefined,
            });

            // Log the response status
            const status = response.status;

            // Handle non-2xx responses
            if (!response.ok) {
                let errorData: KalshiApiError | undefined;
                try {
                    errorData = (await response.json()) as KalshiApiError;
                } catch {
                    // Response body might not be valid JSON
                }

                const errorMessage =
                    errorData?.message || `HTTP ${status} ${response.statusText}`;

                log.error("API request failed", {
                    method,
                    path,
                    status,
                    error: errorMessage,
                    code: errorData?.code,
                });

                throw new Error(`Kalshi API Error [${status}]: ${errorMessage}`);
            }

            // Parse successful response
            const data = (await response.json()) as T;

            done({ status });

            return data;
        } catch (error) {
            // Re-throw Kalshi API errors as-is; wrap unexpected errors
            if (error instanceof Error && error.message.startsWith("Kalshi API Error")) {
                throw error;
            }

            log.error("Network/fetch error", {
                method,
                path,
                error: error instanceof Error ? error.message : String(error),
            });

            throw new Error(
                `Failed to reach Kalshi API: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Constructs the full URL from a path and optional query parameters.
     * Undefined parameter values are silently dropped.
     */
    private buildUrl(
        path: string,
        params?: Record<string, string | number | boolean | undefined>,
        isPublic: boolean = false
    ): string {
        const url = new URL(`${isPublic ? this.publicBaseUrl : this.baseUrl}${path}`);

        if (params) {
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined) {
                    url.searchParams.set(key, String(value));
                }
            }
        }

        return url.toString();
    }
}
