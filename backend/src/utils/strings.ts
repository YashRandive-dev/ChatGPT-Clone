export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds a short conversation title from the first user message. */
export function titleFromMessage(content: string, max = 60): string {
  const clean = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return 'New chat';
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** Rough token estimate (~4 chars/token) used for context budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
