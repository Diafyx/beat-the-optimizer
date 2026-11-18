/** Markdown files from a list of paths: deduplicated and sorted. */
export function markdownFiles(paths: readonly string[]): string[] {
  const files = paths.map((p) => p.trim()).filter((p) => p.toLowerCase().endsWith('.md'));
  return [...new Set(files)].sort();
}
