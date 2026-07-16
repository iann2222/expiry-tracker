export function resetInitialRouteToHome(): void {
  const homeUrl = `${window.location.pathname}${window.location.search}#/`;
  window.history.replaceState(window.history.state, '', homeUrl);
}
