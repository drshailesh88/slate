import type { MethodsBlockDTO, MethodsStatement } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The AUTO Methods · data-collection block (PRISMA 2020 Items 8 / 9 / 10) —
// PURE assembly from RECORDED metadata, never free-typed and never generated
// by a model. Every statement is a factual sentence whose numbers come from the
// `MethodsMetadata` the server seam collected (team roster, review settings,
// recorded resolutions, the AI validation row, the author-contact log), and
// each statement carries those recorded values (`recorded`) so a test can trace
// every claim back to its record.
//
// The two review modes are stated FACTUALLY (review-modes.ts rule): the
// ai_co_reviewer line states the safeguard, never a rigor scold.
// ─────────────────────────────────────────────────────────────────────────────

export interface MethodsMetadata {
  reviewMode: 'two_reviewer' | 'ai_co_reviewer';
  /** Active members whose roles author independent work (reviewer/collaborator). */
  reviewerCount: number;
  arbitratorCount: number;
  /** Recorded screening resolutions, counted by method. */
  screeningResolutions: { alignOnOne: number; sentToArbitrator: number };
  /** Recorded extraction consensus rows, counted by ladder rung. */
  extractionResolutions: {
    discuss: number;
    arbitrator: number;
    authorContact: number;
    unresolved: number;
  };
  /** The author-contact log (extraction consensus rows with a recorded contact). */
  authorContacts: { fields: number; studies: number };
  /** The latest PASSING recall validation, if the AI has one. */
  aiValidation: {
    model: string;
    version: string;
    recall: number;
    sampleSize: number;
  } | null;
  /** reviews.extraction_qc_sample_rate (0..1). */
  qcSampleRate: number;
  /** The extraction template: how many items, across which sections. */
  extractionFieldCount: number;
  extractionSectionLabels: string[];
}

function statement(
  text: string,
  source: MethodsStatement['source'],
  recorded: MethodsStatement['recorded'],
): MethodsStatement {
  return { text, source, recorded };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// ── Item 8 — selection process ────────────────────────────────────────────────

function selectionStatements(meta: MethodsMetadata): MethodsStatement[] {
  const out: MethodsStatement[] = [];

  if (meta.reviewMode === 'ai_co_reviewer') {
    out.push(
      statement(
        `Records were screened independently by ${plural(meta.reviewerCount, 'human reviewer')} and a recall-validated AI reviewer, blinded to each other's decisions until reconciliation.`,
        'team_roster',
        {
          reviewerCount: meta.reviewerCount,
          reviewMode: meta.reviewMode,
          blinded: true,
        },
      ),
    );
  } else {
    out.push(
      statement(
        `Records were screened independently and in duplicate by ${plural(meta.reviewerCount, 'reviewer')}, blinded to each other's decisions until reconciliation.`,
        'team_roster',
        {
          reviewerCount: meta.reviewerCount,
          reviewMode: meta.reviewMode,
          blinded: true,
        },
      ),
    );
  }

  const { alignOnOne, sentToArbitrator } = meta.screeningResolutions;
  if (alignOnOne + sentToArbitrator > 0) {
    const parts: string[] = [];
    if (alignOnOne > 0)
      parts.push(`by discussion (${plural(alignOnOne, 'record')})`);
    if (sentToArbitrator > 0) {
      parts.push(
        `by referral to an independent arbitrator (${plural(sentToArbitrator, 'record')})`,
      );
    }
    out.push(
      statement(
        `Screening disagreements were resolved ${parts.join(' and ')}.`,
        'screening_records',
        { alignOnOne, sentToArbitrator },
      ),
    );
  } else {
    out.push(
      statement(
        'Screening disagreements are resolved by discussion or by referral to an independent arbitrator; none have been recorded yet.',
        'screening_records',
        { alignOnOne: 0, sentToArbitrator: 0 },
      ),
    );
  }

  if (meta.aiValidation) {
    out.push(
      statement(
        `The AI reviewer (${meta.aiValidation.model}, ${meta.aiValidation.version}) was validated before screening: recall on human-labelled includes ${meta.aiValidation.recall.toFixed(2)} over a sample of ${meta.aiValidation.sampleSize} records. It screens blinded, never excludes a record on its own, and its calls are reconciled by a human.`,
        'ai_validation',
        {
          model: meta.aiValidation.model,
          version: meta.aiValidation.version,
          recall: meta.aiValidation.recall,
          sampleSize: meta.aiValidation.sampleSize,
        },
      ),
    );
  } else if (meta.reviewMode === 'ai_co_reviewer') {
    out.push(
      statement(
        'An AI co-reviewer is configured but has not yet passed recall validation; it has not screened any records.',
        'ai_validation',
        { validated: false },
      ),
    );
  } else {
    out.push(
      statement(
        'No automation tool participated in screening.',
        'ai_validation',
        { validated: null },
      ),
    );
  }

  return out;
}

// ── Item 9 — data collection process ─────────────────────────────────────────

function dataCollectionStatements(meta: MethodsMetadata): MethodsStatement[] {
  const out: MethodsStatement[] = [];

  out.push(
    statement(
      `Data were extracted independently by ${plural(meta.reviewerCount, 'reviewer')} using a piloted form; extractors were blinded to each other's values until both locked, and as-extracted data are preserved separately from the consensus.`,
      'team_roster',
      { reviewerCount: meta.reviewerCount, blinded: true },
    ),
  );

  const res = meta.extractionResolutions;
  const resolvedTotal = res.discuss + res.arbitrator;
  if (resolvedTotal + res.unresolved > 0) {
    const parts: string[] = [];
    if (res.discuss > 0)
      parts.push(`by discussion (${plural(res.discuss, 'field')})`);
    if (res.arbitrator > 0) {
      parts.push(
        `by an independent arbitrator (${plural(res.arbitrator, 'field')})`,
      );
    }
    if (parts.length > 0) {
      out.push(
        statement(
          `Extraction disagreements were resolved ${parts.join(' and ')}.`,
          'consensus_extraction',
          { discuss: res.discuss, arbitrator: res.arbitrator },
        ),
      );
    }
    if (res.unresolved > 0) {
      out.push(
        statement(
          `${plural(res.unresolved, 'field')} remain${res.unresolved === 1 ? 's' : ''} unresolved after the recorded escalation ladder, with a rationale logged for each.`,
          'consensus_extraction',
          { unresolved: res.unresolved },
        ),
      );
    }
  } else {
    out.push(
      statement(
        'Extraction disagreements are resolved by discussion, then by an independent arbitrator; none have been recorded yet.',
        'consensus_extraction',
        { discuss: 0, arbitrator: 0, unresolved: 0 },
      ),
    );
  }

  if (meta.authorContacts.fields > 0) {
    out.push(
      statement(
        `Study authors were contacted about ${plural(meta.authorContacts.fields, 'field')} across ${plural(meta.authorContacts.studies, 'study')}; each attempt and response is logged in the review.`,
        'consensus_extraction',
        {
          fieldsContacted: meta.authorContacts.fields,
          studiesContacted: meta.authorContacts.studies,
        },
      ),
    );
  } else {
    out.push(
      statement(
        'No study authors have been contacted; any future contact is logged per field.',
        'consensus_extraction',
        { fieldsContacted: 0, studiesContacted: 0 },
      ),
    );
  }

  const qcPercent = Math.round(meta.qcSampleRate * 100);
  out.push(
    statement(
      `${qcPercent}% of agreed critical fields are sampled for verification against the source report.`,
      'review_settings',
      { qcSampleRate: meta.qcSampleRate, qcPercent },
    ),
  );

  return out;
}

// ── Item 10 — data items ─────────────────────────────────────────────────────

function dataItemsStatements(meta: MethodsMetadata): MethodsStatement[] {
  return [
    statement(
      `Data were sought for ${plural(meta.extractionFieldCount, 'item')} across ${meta.extractionSectionLabels.join(', ')}; every value carries one of four explicit states (reported / not reported / not applicable / unclear) and its source provenance, and calculated values are tagged as derived with their formula.`,
      'review_settings',
      {
        fieldCount: meta.extractionFieldCount,
        sections: meta.extractionSectionLabels.join(', '),
      },
    ),
  ];
}

export function assembleMethodsBlock(meta: MethodsMetadata): MethodsBlockDTO {
  return {
    selection: selectionStatements(meta),
    dataCollection: dataCollectionStatements(meta),
    dataItems: dataItemsStatements(meta),
  };
}
