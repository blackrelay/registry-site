export function externalLinkAttrs(href: string): { target?: "_blank"; rel?: string } {
  if (href.startsWith("/") || href.startsWith("#") || href.includes("blackrelay.network")) {
    return {};
  }
  return {
    target: "_blank",
    rel: "noreferrer",
  };
}
