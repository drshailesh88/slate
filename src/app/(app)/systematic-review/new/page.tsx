import { notFound } from 'next/navigation';
import { isSrEnabled } from '@/lib/sr/flag';
import { CreateReviewWizard } from './create-review-wizard';

// The create-review wizard: stand up a new review + its owner. Flag-gated —
// 404s (unreachable) when SR is off. The 3-step flow (Info → Import → Team)
// lives in the client wizard; the server action owns authz + persistence.
export default function NewReviewPage() {
  if (!isSrEnabled()) {
    notFound();
  }

  return <CreateReviewWizard />;
}
