import { getDb } from './client';
import { sources, type Source } from './schema';

// Fixed UUIDs so seeding is idempotent and fixtures/tests can reference sources
// by a stable id. In production these rows are owned by the Library; here they
// are stubs so a Source card on the canvas references something real by ID.
export const STUB_SOURCES: Source['id'][] = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
];

const STUB_SOURCE_ROWS = [
  {
    id: STUB_SOURCES[0],
    title: 'Attention Is All You Need',
    authors: 'Vaswani et al.',
    venue: 'NeurIPS',
    year: 2017,
  },
  {
    id: STUB_SOURCES[1],
    title: 'Deep Residual Learning for Image Recognition',
    authors: 'He, Zhang, Ren, Sun',
    venue: 'CVPR',
    year: 2016,
  },
  {
    id: STUB_SOURCES[2],
    title: 'BERT: Pre-training of Deep Bidirectional Transformers',
    authors: 'Devlin, Chang, Lee, Toutanova',
    venue: 'NAACL',
    year: 2019,
  },
] satisfies Array<{
  id: string;
  title: string;
  authors: string;
  venue: string;
  year: number;
}>;

export async function ensureStubSources(): Promise<void> {
  const db = getDb();
  await db.insert(sources).values(STUB_SOURCE_ROWS).onConflictDoNothing();
}

export async function listSources(): Promise<Source[]> {
  const db = getDb();
  return db.select().from(sources).orderBy(sources.createdAt);
}
