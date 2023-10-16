import sanitizeHtml from "sanitize-html";

export const sanitizer = (dirty: string): string => {
  const clean = sanitizeHtml(dirty, {
    allowedTags: ["b", "i", "a", "h1", "h2", "ul", "ol", "li", "p", "br"],
    allowedAttributes: {
      a: ["href"],
    },
  });

  return clean;
};
