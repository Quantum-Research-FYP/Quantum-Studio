/** True when the app is shown inside an iframe (e.g. embedded in a Moodle course). */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // reading window.top can throw when framed cross-origin
  }
}

export function useEmbedded(): boolean {
  // The value can't change while the page is open, so no state is needed.
  return isEmbedded();
}
