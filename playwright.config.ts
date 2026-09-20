import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', use: { baseURL: 'http://127.0.0.1:5187/react-playground/', viewport: { width: 1440, height: 1000 } }, webServer: { command: 'npm run dev -- --port 5187 --strictPort', url: 'http://127.0.0.1:5187/react-playground/', reuseExistingServer: false }, reporter: 'list' });
