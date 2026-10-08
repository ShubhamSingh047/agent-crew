// Commit and PR commands that credit Claude are refused, never rewritten:
// editing a shell command can change what it runs, so Claude retries the
// command without the credit instead.
const COMMITS = /\b(git\s+commit|git\s+notes|gh\s+pr\s+(create|edit))\b/
const CREDIT = [
  /Co-Authored-By:[^\n]*(Claude|anthropic)/i,
  /Generated with \[?Claude Code\]?/i,
]

export const REFUSAL =
  'This setup never credits Claude in commits or pull requests. Remove the ' +
  '"Co-Authored-By: Claude" trailer and any "Generated with Claude Code" line, then run the command again.'

export function creditsClaude(command: string): boolean {
  return COMMITS.test(command) && CREDIT.some(pattern => pattern.test(command))
}
