import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const credentials = fs.existsSync('.env.test.local') ? Object.fromEntries(fs.readFileSync('.env.test.local', 'utf8')
  .split(/\r?\n/).filter(line => line.includes('=') && !line.trim().startsWith('#'))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim()]; })) : {};

// Uses real project auth; no HTTP interception and no study writes.
test('live login, persistent session, logout, and switching confirmed accounts', async ({ page }) => {
  const names = ['CADENCE_TEST_EMAIL_A', 'CADENCE_TEST_PASSWORD_A', 'CADENCE_TEST_EMAIL_B', 'CADENCE_TEST_PASSWORD_B'];
  test.skip(names.some(name => !credentials[name]), 'Two confirmed test accounts in .env.test.local are required.');
  for (const account of ['A', 'B', 'A']) {
    await page.goto('/');
    await page.getByLabel('EMAIL', { exact: true }).fill(credentials[`CADENCE_TEST_EMAIL_${account}`]);
    await page.getByLabel('PASSWORD', { exact: true }).fill(credentials[`CADENCE_TEST_PASSWORD_${account}`]);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    await expect(page.locator('.account-panel')).toContainText(credentials[`CADENCE_TEST_EMAIL_${account}`]);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  }
});
