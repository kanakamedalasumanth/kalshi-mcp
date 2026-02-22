// ============================================
// src/config.ts — Environment Configuration Loader
// ============================================
// Loads and validates all required configuration from environment
// variables. Uses dotenv to read from a .env file in the project root.
//
// WHY A DEDICATED CONFIG MODULE?
// Centralising config loading means every other module imports a single,
// typed object instead of reading process.env directly. This gives us
// one place to add validation, defaults, and clear error messages when
// something is missing.
// ============================================

import { config as loadEnv } from "dotenv";

// Load .env file from the project root into process.env
loadEnv();

/**
 * KalshiConfig — typed configuration object used throughout the app.
 *
 * @property apiKeyId       Your Kalshi-issued API Key ID (appears in the dashboard)
 * @property privateKeyPath Filesystem path to the RSA private key PEM file
 * @property baseUrl        Kalshi REST API base URL (production or demo)
 * @property logLevel       Minimum log level to emit: debug | info | warn | error
 */
export interface KalshiConfig {
    apiKeyId: string;
    privateKeyPath: string;
    baseUrl: string;
    logLevel: "debug" | "info" | "warn" | "error";
    publicBaseUrl: string;
}

/**
 * Reads environment variables and returns a validated KalshiConfig.
 * Throws immediately if any required variable is missing — we want to
 * fail fast at startup rather than during a request.
 */
function loadConfig(): KalshiConfig {
    const apiKeyId = process.env.KALSHI_API_KEY_ID;
    const privateKeyPath = process.env.KALSHI_PRIVATE_KEY_PATH;

    // ── Required checks ──────────────────────────────────────────
    if (!apiKeyId) {
        throw new Error(
            "KALSHI_API_KEY_ID is not set. " +
            "Generate an API key at https://kalshi.com → Account → API Keys."
        );
    }
    if (!privateKeyPath) {
        throw new Error(
            "KALSHI_PRIVATE_KEY_PATH is not set. " +
            "Point it to your RSA private key PEM file."
        );
    }

    // ── Optional with defaults ───────────────────────────────────
    const baseUrl =
        process.env.KALSHI_API_BASE_URL ||
        "https://api.elections.kalshi.com/trade-api/v2";

    const logLevel = (process.env.LOG_LEVEL || "info") as KalshiConfig["logLevel"];

    const publicBaseUrl = process.env.KALSHI_PUBLIC_API_BASE_URL ||
        "https://api.elections.kalshi.com/v1/";

    return { apiKeyId, privateKeyPath, baseUrl, logLevel, publicBaseUrl };
}

/** Singleton config instance — created once at import time. */
export const kalshiConfig = loadConfig();
