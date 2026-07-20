import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      // Tests exercise the error paths on purpose; their log lines would drown
      // the report. Override on the command line to inspect them.
      CVLAC_LOG_LEVEL: process.env.CVLAC_LOG_LEVEL ?? 'silent',
    },
  },
});
