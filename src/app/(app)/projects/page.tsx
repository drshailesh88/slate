import { Folders } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';

export default function ProjectsPage() {
  return (
    <EmptyState
      icon={Folders}
      title="No projects yet."
      body="Start one from Home — your reviews, screens, and drafts will collect here."
      ctaHref="/"
      ctaLabel="Go to Home"
    />
  );
}
