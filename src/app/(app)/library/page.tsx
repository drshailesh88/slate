import { Library } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';

export default function LibraryPage() {
  return (
    <EmptyState
      icon={Library}
      title="Your library is empty."
      body="Papers and sources you save will collect here. Find them from Home."
      ctaHref="/"
      ctaLabel="Go to Home"
    />
  );
}
