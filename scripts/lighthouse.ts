// Runs Lighthouse CI (lighthouserc.json) against dist/ with the mobile
// defaults. It uses Playwright's Chromium unless CHROME_PATH is set, so local
// and CI runs use the same browser. Run after `vite build`.
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const env = {
  ...process.env,
  CHROME_PATH: process.env['CHROME_PATH'] ?? chromium.executablePath(),
};
const result = spawnSync('npx', ['lhci', 'autorun'], { stdio: 'inherit', env });
process.exitCode = result.status ?? 1;
