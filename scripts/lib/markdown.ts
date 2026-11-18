/** Markdown files from a list of paths: deduplicated and sorted. */
export function markdownFiles(paths: readonly string[]): string[] {
  const files = paths.map((p) => p.trim()).filter((p) => p.toLowerCase().endsWith('.md'));
  return [...new Set(files)].sort();
}

/** Removes HTML comments, which GitHub does not render. An unclosed one runs to the end. */
export function stripComments(text: string): string {
  return text.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
}

const HEADING = /^#{1,6} \S/;

/** The ATX heading lines of a Markdown text, trimmed, outside HTML comments. */
export function headings(markdown: string): string[] {
  return stripComments(markdown)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => HEADING.test(line));
}

/**
 * The text under a heading, up to the next heading, with HTML comments removed
 * and trimmed; null if the heading is missing.
 */
export function section(markdown: string, heading: string): string | null {
  const lines = stripComments(markdown).split('\n');
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const end = lines.findIndex((line, i) => i > start && HEADING.test(line.trim()));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim();
}
