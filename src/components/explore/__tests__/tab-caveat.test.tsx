import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TabCaveat } from '../tab-caveat';
import { WEB_CAVEAT } from '../tab-meta';

describe('TabCaveat', () => {
  it.each(['web', 'news', 'discussions'] as const)(
    'renders the quality caveat for the %s tab',
    (tab) => {
      render(<TabCaveat tab={tab} />);
      expect(screen.getByText(WEB_CAVEAT)).toBeInTheDocument();
    },
  );

  it.each(['academic', 'videos'] as const)(
    'renders nothing for the %s tab',
    (tab) => {
      const { container } = render(<TabCaveat tab={tab} />);
      expect(container).toBeEmptyDOMElement();
    },
  );
});
