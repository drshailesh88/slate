import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';

export default function InboxPage() {
  return (
    <EmptyState
      icon={Inbox}
      title="Nothing needs you."
      body="Alerts and updates will land here — quiet by default."
      ctaHref="/"
      ctaLabel="Go to Home"
    />
  );
}
