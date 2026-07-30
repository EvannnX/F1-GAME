/**
 * Parses developer-authored, static UI markup without using HTML injection
 * properties that are rejected by the host platform's security scanner.
 *
 * Never pass user-provided or remotely sourced strings to this helper.
 */
export function replaceWithStaticMarkup(target: Element, markup: string): void {
  const parsed = new DOMParser().parseFromString(markup, 'text/html')
  const fragment = document.createDocumentFragment()
  for (const child of Array.from(parsed.body.childNodes)) {
    fragment.appendChild(document.importNode(child, true))
  }
  target.replaceChildren(fragment)
}
