import { lazy } from 'react';

const RELOAD_KEY = 'handoff-chunk-reload';

// React.lazy for a page. After a new deploy, an open tab can ask for a page file that no longer
// exists; reload once to pick up the new build instead of crashing. A second failure is real.
export default function lazyPage(load) {
  return lazy(async () => {
    try {
      const page = await load();
      try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* storage blocked */ }
      return page;
    } catch (error) {
      let reloaded = true;
      try {
        reloaded = sessionStorage.getItem(RELOAD_KEY) === '1';
        if (!reloaded) sessionStorage.setItem(RELOAD_KEY, '1');
      } catch { /* storage blocked: don't risk a reload loop */ }
      if (!reloaded) {
        window.location.reload();
        return new Promise(() => {});
      }
      throw error;
    }
  });
}
