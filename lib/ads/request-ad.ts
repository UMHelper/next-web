const pushedNodes = new WeakSet<Element>();

/**
 * Pushes a single AdSense request for one <ins> element.
 *
 * The WeakSet keeps React StrictMode's double-invoked effects and remounts from
 * pushing the same element twice; the status attribute covers elements that
 * AdSense already processed. Ad blockers can make the queue throw — that must
 * never break the page.
 */
export function requestAd(ins: Element | null, queue: unknown[]): boolean {
  if (!ins) return false;
  if (ins.getAttribute("data-adsbygoogle-status")) return false;
  if (pushedNodes.has(ins)) return false;

  pushedNodes.add(ins);

  try {
    queue.push({});
  } catch {
    return false;
  }

  return true;
}
