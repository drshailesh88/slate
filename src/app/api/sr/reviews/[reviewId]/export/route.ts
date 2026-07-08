import { NextResponse } from 'next/server';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { buildExportBundle } from '@/lib/sr/export/assemble';
import { buildCsvExport, isCsvDataset } from '@/lib/sr/export/csv';
import { buildPdfExport } from '@/lib/sr/export/pdf';
import { buildRevmanExport } from '@/lib/sr/export/revman';
import { buildRisExport } from '@/lib/sr/export/ris';
import { isSrEnabled } from '@/lib/sr/flag';

// GET /api/sr/reviews/[reviewId]/export?format=revman|ris|csv|pdf[&dataset=…]
//
// The download boundary. Thin by design: flag gate, live membership
// (requireMember — deny→404, no existence leak), then the bundle is assembled
// through the export seam — blinded datasets flow only through the chokepoint's
// reconcile-gated ForExport readers, so nothing here can leak a per-reviewer
// row during `independent`. A blinded-withheld CSV dataset answers 409 with the
// honest reason instead of an empty file.

const CSV_DATASET_IDS =
  'references, consensus, as_extracted, rob, screening' as const;

function attachment(
  content: string | Uint8Array,
  filename: string,
  contentType: string,
): Response {
  return new Response(content as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ reviewId: string }> },
): Promise<Response> {
  if (!isSrEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const { reviewId } = await context.params;

  let ctx: MemberContext;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    if (isSrAuthzError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }

  const url = new URL(request.url);
  const format = url.searchParams.get('format');
  const dataset = url.searchParams.get('dataset') ?? 'consensus';

  const bundle = await buildExportBundle({
    reviewId,
    requesterId: ctx.userId,
    role: ctx.member.role,
  });
  if (!bundle) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  switch (format) {
    case 'ris':
      return attachment(
        buildRisExport(bundle),
        'sr-references.ris',
        'application/x-research-info-systems',
      );
    case 'revman':
      return attachment(
        buildRevmanExport(bundle),
        'sr-review.rm5',
        'application/xml; charset=utf-8',
      );
    case 'pdf':
      return attachment(
        Buffer.from(buildPdfExport(bundle), 'latin1'),
        'sr-export.pdf',
        'application/pdf',
      );
    case 'csv': {
      if (!isCsvDataset(dataset)) {
        return NextResponse.json(
          {
            error: `Unknown dataset "${dataset}". Use one of: ${CSV_DATASET_IDS}.`,
          },
          { status: 400 },
        );
      }
      const result = buildCsvExport(bundle, dataset);
      if (result.status === 'withheld') {
        return NextResponse.json({ error: result.reason }, { status: 409 });
      }
      return attachment(
        result.content,
        result.filename,
        'text/csv; charset=utf-8',
      );
    }
    default:
      return NextResponse.json(
        { error: 'Unknown format. Use one of: revman, ris, csv, pdf.' },
        { status: 400 },
      );
  }
}
