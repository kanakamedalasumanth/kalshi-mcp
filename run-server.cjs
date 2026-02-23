#!/usr/bin/env node
// Run the Kalshi MCP server with proper environment variables

import { config as envConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import {dirname, join} from 'path';
import { createServer } from './dist/index.js';

// Get the current file's directory for .env path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load from .env file in the same directory
envConfig({ path: join(__dirname, '.env') });

// Start the server
await createServer();