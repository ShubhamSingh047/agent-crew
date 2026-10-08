import { expect, test } from 'claude-code/testing'

import { critter, miniCritter, runs, toLines } from './critters'

test('the pane still draws with no agents', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-crew', surface, component: 'Pane', requestId: 'agents', props: {} as never })
    expect(await ui.find({ type: 'Text', text: /No agents yet/ })).toBeDefined()
    await ui.unmount()
  }
})

test('each model draws a 16x6 block critter in its own colour', () => {
  for (const [tier, color] of [['haiku', '#2a9d8f'], ['sonnet', '#3d6fd6'], ['opus', '#8a5cc7'], ['fable', '#d63a2f']] as const) {
    const lines = toLines(critter(tier, 1))
    expect(lines).toHaveLength(6)
    expect(lines.every(l => l.length === 16)).toBe(true)
    expect(lines.flat().some(c => c.color === color || c.backgroundColor === color)).toBe(true)
    expect(runs(lines[2]!).length).toBeLessThan(16)
  }
})

test('the pane critter is half size: 12 wide, 3 lines', () => {
  for (const tier of ['haiku', 'sonnet', 'opus', 'fable'] as const) {
    const lines = toLines(miniCritter(tier, 1))
    expect(lines).toHaveLength(3)
    expect(lines.every(l => l.length === 12)).toBe(true)
  }
})

test('commit and PR commands that credit Claude are refused; nothing is rewritten', async ($, on) => {
  let ran: string | undefined
  on('tool.call', ($, e) => {
    ran = (e as { command?: string }).command
    return { result: 'ok' } as never
  })

  const heredoc = `git commit -m "$(cat <<'EOF'\nFix bug\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nEOF\n)"`
  const pr = 'gh pr create --title T --body "Summary\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)"'
  for (const command of [heredoc, pr]) {
    ran = undefined
    const answer = await $.tool.call({ tool: 'Bash', command } as never)
    expect(ran).toBeUndefined()
    expect(JSON.stringify(answer)).toContain('never credits Claude')
  }

  for (const command of ['git commit -m "x\n\nCo-Authored-By: Priya <p@example.com>"', 'echo Co-Authored-By: Claude']) {
    ran = undefined
    await $.tool.call({ tool: 'Bash', command } as never)
    expect(ran).toBe(command)
  }
})
