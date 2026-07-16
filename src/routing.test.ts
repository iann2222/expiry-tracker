import { afterEach, describe, expect, it } from 'vitest';
import { resetInitialRouteToHome } from './routing';

describe('initial route', () => {
  const originalUrl = window.location.href;

  afterEach(() => {
    window.history.replaceState(null, '', originalUrl);
  });

  it('starts at the home view even when the previous URL was the add page', () => {
    window.history.replaceState(null, '', '/expiry-tracker/#/add');

    resetInitialRouteToHome();

    expect(window.location.pathname).toBe('/expiry-tracker/');
    expect(window.location.hash).toBe('#/');
  });
});
