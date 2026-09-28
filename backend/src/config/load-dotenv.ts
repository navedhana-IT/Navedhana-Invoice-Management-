import { existsSync } from 'fs';

/** Loads backend/.env if present (Node >= 20.12 built-in). Real deployments inject env vars directly. */
export function loadDotEnv() {
  if (existsSync('.env')) process.loadEnvFile('.env');
}
