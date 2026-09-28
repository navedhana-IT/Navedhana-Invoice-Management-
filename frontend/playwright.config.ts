import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against an already-running stack (web + API + worker + Mailpit). Set E2E_BASE_URL to target another host.
 * Flows run serially: login and signup are rate limited per IP.
 */
export default defineConfig({
  testDir: './e2e',
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /responsive/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: /responsive/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: /responsive/ },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] }, testMatch: /smoke/ },
    { name: 'responsive', use: { ...devices['Desktop Chrome'] }, testMatch: /responsive/, timeout: 30 * 60_000 },
  ],
});
