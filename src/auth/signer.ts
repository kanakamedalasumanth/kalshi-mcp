// ============================================
// src/auth/signer.ts — RSA Request Signer for Kalshi API
// ============================================
// Kalshi authenticates API requests using RSA-PSS signatures.
// For every request, the client must send three headers:
//
//   KALSHI-ACCESS-KEY       → Your API key ID
//   KALSHI-ACCESS-TIMESTAMP → Current Unix timestamp in milliseconds
//   KALSHI-ACCESS-SIGNATURE → RSA-PSS signature of:
//                             timestamp + method + path (e.g. "1708000000000GET/trade-api/v2/events")
//
// This module handles reading the private key from disk once (cached)
// and producing those three headers for any given request.
//
// WHY RSA-PSS?
// Kalshi chose RSA-PSS (Probabilistic Signature Scheme) because it's
// more secure than PKCS#1 v1.5 — each signature includes randomness,
// preventing certain oracle attacks. The digest is SHA-256.
// ============================================

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { createLogger } from "../logger.js";

const log = createLogger("AuthSigner");

/**
 * The three authentication headers that every Kalshi API request needs.
 */
export interface KalshiAuthHeaders {
    "KALSHI-ACCESS-KEY": string;
    "KALSHI-ACCESS-TIMESTAMP": string;
    "KALSHI-ACCESS-SIGNATURE": string;
}

/**
 * KalshiSigner — generates RSA-PSS signatures for Kalshi API authentication.
 *
 * Create one instance at startup and reuse it for all requests. The private
 * key is read from disk exactly once and cached in memory.
 */
export class KalshiSigner {
    private apiKeyId: string;
    private privateKey: string;

    /**
     * @param apiKeyId       Your Kalshi API key ID
     * @param privateKeyPath Path to the RSA private key PEM file
     */
    constructor(apiKeyId: string, privateKeyPath: string) {
        this.apiKeyId = apiKeyId;

        // Read the private key once and cache it — we don't want to hit
        // the filesystem on every request
        log.info("Loading RSA private key", { path: privateKeyPath });
        this.privateKey = readFileSync(privateKeyPath, "utf-8");
        log.info("RSA private key loaded successfully");
    }

    /**
     * Signs a request and returns the three required auth headers.
     *
     * @param method  HTTP method in uppercase (GET, POST, PUT, DELETE)
     * @param path    Request path WITHOUT the base URL (e.g. "/trade-api/v2/events")
     * @returns       Object containing the three KALSHI-ACCESS-* headers
     *
     * The signature payload is: `${timestampMs}${method}${path}`
     * signed with RSA-PSS using SHA-256 and a salt length of 32 bytes.
     */
    sign(method: string, path: string): KalshiAuthHeaders {
        // Timestamp must be in milliseconds as a string
        const timestamp = Date.now().toString();

        // Build the message to sign: timestamp + HTTP method + path
        // Example: "1708000000000GET/trade-api/v2/events"
        const message = timestamp + method.toUpperCase() + path;

        log.debug("Signing request", { method: method.toUpperCase(), path });

        // Create RSA-PSS signature with SHA-256 digest
        const signer = createSign("RSA-SHA256");
        signer.update(message);
        signer.end();

        // Sign with PSS padding (saltLength=32 matches Kalshi's expectation)
        const signature = signer.sign(
            {
                key: this.privateKey,
                padding: 6, // RSA_PKCS1_PSS_PADDING (crypto constant = 6)
                saltLength: 32,
            },
            "base64"               // Encode the signature as base64 for the header
        );

        log.debug("Request signed successfully", { timestamp });

        return {
            "KALSHI-ACCESS-KEY": this.apiKeyId,
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
            "KALSHI-ACCESS-SIGNATURE": signature,
        };
    }
}
