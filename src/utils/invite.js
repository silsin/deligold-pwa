/**
 * Read the ?invite= query parameter from the URL.
 * Since the router uses hash history, the query lives on the document URL, not the hash.
 */
export function readInviteCode() {
  try {
    const code = new URLSearchParams(window.location.search).get('invite');
    if (code) {
      // Clear the query from the URL so a refresh doesn't re-trigger
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
    return code ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}
