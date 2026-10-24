import { useEffect } from 'react';
import { site } from '../config/site';

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${site.name}` : `${site.name} | Data bundles and WAEC results checkers`;
  }, [title]);
}
