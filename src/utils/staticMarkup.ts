export function replaceStaticMarkup(target: Element, markup: string): void {
  const parsed = new DOMParser().parseFromString(
    `<!doctype html><html><body>${markup}</body></html>`,
    'text/html',
  )
  const fragment = document.createDocumentFragment()
  for (const child of Array.from(parsed.body.childNodes)) {
    fragment.appendChild(document.importNode(child, true))
  }
  target.replaceChildren(fragment)
}
