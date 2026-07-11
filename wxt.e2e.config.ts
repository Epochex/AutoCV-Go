import { defineConfig } from 'wxt';
import baseConfig from './wxt.config';

export default defineConfig({
  ...baseConfig,
  webExt: {
    chromiumArgs: ['--headless=new', '--remote-debugging-port=9223'],
    chromiumPort: 9223,
    startUrls: ['http://127.0.0.1:4173/test-fixtures/job-form.html'],
  },
});
