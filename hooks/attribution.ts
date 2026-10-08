// Lines that credit Claude in a commit message or PR body: trailers, the
// "Generated with Claude Code" footer, and the same written inline as "\n".
const ATTRIBUTION: RegExp[] = [
  /^[ \t]*Co-Authored-By:[^\n]*(Claude|anthropic)[^\n]*\n?/gim,
  /^[ \t]*(🤖 )?Generated with \[?Claude Code\]?[^\n]*\n?/gim,
  /(\\n)+[ \t]*Co-Authored-By:[^"'\n\\]*(Claude|anthropic)[^"'\n\\]*/gi,
  /(\\n)+[ \t]*(🤖 )?Generated with \[?Claude Code\]?[^"'\n\\]*/gi,
]
const COMMITS = /\b(git\s+commit|gh\s+pr\s+(create|edit)|git\s+notes)\b/

export function stripAttribution(command: string): string {
  if (!COMMITS.test(command)) return command
  return ATTRIBUTION.reduce((text, pattern) => text.replace(pattern, ''), command)
}
