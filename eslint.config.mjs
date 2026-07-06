import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// The three blinded SR base tables. Importing these symbols is forbidden
// everywhere except the blinding chokepoint (src/lib/sr/authz/**). This is the
// static-analysis layer of the wall from FOUNDATION-auth-tenancy.md §6; the
// Postgres privilege wall + CI grep are the other two layers.
const BLINDED_TABLE_SYMBOLS = [
  'screeningDecisions',
  'extractionEntries',
  'robAssessments',
];

const blindedImportRule = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: [
            '**/db/schema',
            '**/db/schema/**',
            '@/lib/db/schema',
            '@/lib/db/schema/**',
          ],
          importNames: BLINDED_TABLE_SYMBOLS,
          message:
            'Blinded SR tables (screening_decisions, extraction_entries, rob_assessments) may only be read through the blinding chokepoint in src/lib/sr/authz/**. See FOUNDATION-auth-tenancy.md §6.',
        },
      ],
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Enforce the blinding wall across the app, then exempt the two places allowed
  // to name the blinded tables: their definition and the chokepoint that reads them.
  {
    files: ['src/**/*.{ts,tsx,js,jsx,mjs}'],
    rules: blindedImportRule,
  },
  {
    files: ['src/lib/db/schema/**', 'src/lib/sr/authz/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
