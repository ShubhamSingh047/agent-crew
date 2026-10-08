import { atom, read, update } from 'claude-code'
import type { AgentInfo, EngineInterface, Register } from 'claude-code'

import type { AgentDetail, AgentRow, UsageSnapshot, UsageWindow } from '../types'
import { miniCritter, MOODS, runs, toLines } from './critters'
import type { Tier } from './critters'
import { stripAttribution } from './attribution'
import { POLICY } from './policy'

// ---- Agents pane ----
const PANE = 'agents'
const rows = atom({ plugin: 'agent-crew', key: 'rows' } as const, [] as AgentRow[])
const frame = atom({ plugin: 'agent-crew', key: 'frame' } as const, 0)
const details = atom({ plugin: 'agent-crew', key: 'details' } as const, {} as Record<string, AgentDetail>)

// Every agent seen this session, kept after the engine drops it from the list.
const seen = new Map<string, AgentRow>()
const LIMIT = 40
const CRITTERS = 3 // running agents drawn with a critter
const ACTIVE = ['running', 'waiting', 'idle', 'pending']
const FINISHED = ['completed', 'ended', 'failed', 'killed']

const ORDER: Record<string, number> = {
  running: 0, waiting: 1, idle: 1, pending: 2, completed: 3, ended: 3, failed: 3, killed: 3,
}

function tierOf(model: unknown): Tier | undefined {
  if (typeof model !== 'string') return undefined
  const m = model.toLowerCase()
  return (['fable', 'opus', 'sonnet', 'haiku'] as const).find(t => m.includes(t))
}

function merge(list: AgentInfo[], known: Record<string, AgentDetail>): AgentRow[] {
  const live = new Set(list.map(agent => agent.id))

  for (const agent of list) {
    seen.set(agent.id, {
      id: agent.id,
      kind: agent.type,
      title: agent.description,
      status: agent.status,
      depth: agent.parentId ? 1 : 0,
      model: known[agent.id]?.model,
    })
  }

  for (const [id, row] of seen) {
    if (!live.has(id) && ACTIVE.includes(row.status)) {
      seen.set(id, { ...row, status: 'ended' })
    }
  }

  return [...seen.values()]
    .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9))
    .slice(0, LIMIT)
}

function glyph(status: string): { mark: string; tone: 'success' | 'warning' | 'error' | 'inactive' } {
  switch (status) {
    case 'running': return { mark: '●', tone: 'success' }
    case 'waiting':
    case 'idle': return { mark: '◐', tone: 'warning' }
    case 'pending': return { mark: '○', tone: 'inactive' }
    case 'completed': return { mark: '✓', tone: 'success' }
    case 'ended': return { mark: '⏹', tone: 'inactive' }
    case 'failed': return { mark: '✗', tone: 'error' }
    default: return { mark: '✗', tone: 'inactive' }
  }
}

const seconds = (ms?: number) => (ms === undefined ? '' : ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`)
const kilo = (n?: number) => (n === undefined ? '' : n >= 1000 ? `${(n / 1000).toFixed(1)}k tokens` : `${n} tokens`)
const oneLine = (text: string, max: number) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

// "Read slugify.mjs", "Bash npm test": the tool and the most telling argument.
function describe(e: { tool: string } & Record<string, unknown>): string {
  for (const key of ['file_path', 'path', 'pattern', 'command', 'url', 'query', 'description']) {
    const value = e[key]
    if (typeof value === 'string' && value) {
      const shown = key.endsWith('path') ? value.split('/').pop()! : value
      return `${e.tool} ${oneLine(shown, 40)}`
    }
  }
  return e.tool
}

const patch = (id: string, change: (d: AgentDetail) => AgentDetail) =>
  (map: Record<string, AgentDetail>) => ({ ...map, [id]: change(map[id] ?? { tools: 0 }) })

let ticker: { cancel: () => void } | undefined
let animator: { cancel: () => void } | undefined

export const registerPane: Register = on => {

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.agentId) {
      const startedAt = await $.clock.now()
      const model = tierOf(result.model) ?? tierOf(e.model) ?? tierOf(e.parentModel)
      await update($, details, patch(result.agentId, d => ({ ...d, model, task: e.prompt, startedAt })))
    }
    return result
  }).catch(($, e, next) => next(e))

  // Each tool a subagent calls: its latest activity and a running count.
  on('tool.call', async ($, e, next) => {
    if (e.agentId) {
      const activity = describe(e as unknown as { tool: string } & Record<string, unknown>)
      await update($, details, patch(e.agentId, d => ({ ...d, tools: d.tools + 1, activity })))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      const used = e.usage ? e.usage.input_tokens + e.usage.output_tokens + e.usage.cache_read_input_tokens + e.usage.cache_creation_input_tokens : undefined
      const answer = 'answer' in e && typeof e.answer === 'string' ? e.answer : undefined
      await update($, details, patch(e.agentId!, d => ({
        ...d,
        durationMs: e.durationMs,
        tokens: used === undefined ? d.tokens : (d.tokens ?? 0) + used,
        answer: answer ?? d.answer,
        activity: undefined,
      })))
    }
    return next(e)
  })

  // Adds the orchestration rules to the system prompt, so every session follows them.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    return { ...result, sections: [...result.sections, { id: 'agent-crew:policy', text: POLICY, scope: 'session' as const }] }
  })

  // The spinner says what the agents are doing: a running agent's own verb, or the angriest one's.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (e.props.message) return next(e)
    const [list, known] = await Promise.all([read($, rows), read($, details)])
    const own = known[e.requestId]?.model as Tier | undefined
    const top = list
      .filter(r => r.status === 'running' && r.model)
      .map(r => r.model as Tier)
      .sort((a, b) => MOODS[b].rank - MOODS[a].rank)[0]
    const tier = own ?? top
    return tier ? next({ ...e, props: { ...e.props, word: MOODS[tier].verb } }) : next(e)
  })

  on('command.run', { command: 'agent-board' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agents' })
    return { text: 'Agents pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const [list, known, f] = await Promise.all([read($, rows), read($, details), read($, frame)])
    const running = list.filter(row => row.status === 'running').length
    const finished = list.filter(row => FINISHED.includes(row.status)).length
    const active = list.filter(row => ACTIVE.includes(row.status))
    // Only running agents show an elapsed clock; no clock read otherwise.
    const now = active.length > 0 ? await $.clock.now().catch(() => 0) : 0
    const done = list.filter(row => FINISHED.includes(row.status))
    let budget = Math.max(4, (e.viewport?.rows ?? 24) - 3)

    const name = (row: AgentRow) => {
      const mood = row.model ? MOODS[row.model as Tier] : undefined
      return <Text bold color={mood?.color}>{mood ? mood.name : row.kind}</Text>
    }

    const activeCard = (row: AgentRow, withCritter: boolean) => {
      const d = known[row.id]
      const mood = row.model ? MOODS[row.model as Tier] : undefined
      const elapsed = d?.startedAt && now ? seconds(now - d.startedAt) : ''
      const facts = (
        <Box flexDirection="column" marginLeft={withCritter ? 1 : 0}>
          <Box flexDirection="row">
            {name(row)}
            <Text dimColor> · {mood ? `${mood.mood} · ` : ''}{row.status}{elapsed ? ` · ${elapsed}` : ''}{d?.tools ? ` · ${d.tools} tools` : ''}</Text>
          </Box>
          <Text wrap="truncate-end">{row.title}</Text>
          <Text dimColor wrap="truncate-end">{d?.activity ? `↳ ${d.activity}` : '↳ starting…'}</Text>
        </Box>
      )
      if (!withCritter || !row.model) return <Box key={row.id} flexDirection="row" marginTop={1}>{facts}</Box>
      return (
        <Box key={row.id} flexDirection="row" marginTop={1}>
          <Box flexDirection="column" width={13}>
            {toLines(miniCritter(row.model as Tier, f)).map((line, y) => (
              <Box key={`l${y}`} flexDirection="row">
                {runs(line).map((c, i) => (
                  <Text key={`c${i}`} color={c.color} backgroundColor={c.backgroundColor}>{c.ch}</Text>
                ))}
              </Box>
            ))}
          </Box>
          {facts}
        </Box>
      )
    }

    const doneCard = (row: AgentRow) => {
      const d = known[row.id]
      const { mark, tone } = glyph(row.status)
      const stats = [row.status, seconds(d?.durationMs), d?.tools ? `${d.tools} tools` : '', kilo(d?.tokens)].filter(Boolean).join(' · ')
      return (
        <Box key={row.id} flexDirection="column" marginTop={1}>
          <Box flexDirection="row">
            <Text color={tone}>{mark} </Text>
            {name(row)}
            <Text dimColor> · {stats}</Text>
          </Box>
          <Text wrap="truncate-end">  {row.title}</Text>
          {d?.answer ? <Text dimColor wrap="truncate-end">  → {oneLine(d.answer, 120)}</Text> : null}
        </Box>
      )
    }

    const shownActive = active.filter((_, i) => {
      const cost = 4
      if (budget < cost) return false
      budget -= cost
      return i >= 0
    })
    const shownDone = done.filter(row => {
      const cost = known[row.id]?.answer ? 4 : 3
      if (budget < cost) return false
      budget -= cost
      return true
    })

    return (
      <Box flexDirection="column">
        <Text dimColor>
          {list.length} agents · {running} running · {finished} finished
        </Text>
        {list.length === 0 && <Text dimColor>No agents yet. When Claude starts one, its task and progress show here.</Text>}
        {shownActive.length > 0 && <Box marginTop={1}><Text bold>Working</Text></Box>}
        {shownActive.map((row, i) => activeCard(row, i < CRITTERS))}
        {shownDone.length > 0 && <Box marginTop={1}><Text bold>Finished</Text></Box>}
        {shownDone.map(doneCard)}
        {shownActive.length + shownDone.length < active.length + done.length && (
          <Text dimColor>+{active.length + done.length - shownActive.length - shownDone.length} more</Text>
        )}
      </Box>
    )
  })
}

// Runs once per session start, from the plugin's one session.start hook.
export async function startPane($: EngineInterface) {
  ticker?.cancel()
  animator?.cancel()

  await $.command.register({
    name: 'agent-board',
    description: 'Show the agents of this session in a pane (built-in /agents is a different command)',
  })
  void $.ui.open({ id: PANE, title: 'Agents' })

  // Polls the agent list; the atom only redraws the pane when it is set.
  ticker = $.clock.every(1500, async () => {
    const [list, known] = await Promise.all([$.agent.list(), read($, details)])
    await update($, rows, () => merge(list, known))
  })
  // Steps the critters and the elapsed clocks while an agent runs.
  animator = $.clock.every(450, () => {
    read($, rows).then(list => list.some(r => r.status === 'running') && update($, frame, f => (f + 1) % 12))
  })

}

// ---- Usage meter ----
const snapshot = atom(
  { plugin: 'agent-crew', key: 'snapshot' } as const,
  null as UsageSnapshot | null,
)
const now = atom({ plugin: 'agent-crew', key: 'now' } as const, 0)

const LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'spend',
}

function pick(usage: {
  context: UsageSnapshot['context']
  rateLimits: UsageWindow[]
  cost?: { usd: number }
}): UsageSnapshot {
  return {
    context: usage.context,
    rateLimits: usage.rateLimits,
    cost: usage.cost?.usd,
  }
}

function resetsIn(iso: string | undefined, nowMs: number): string {
  if (!iso) return ''
  const ms = Date.parse(iso) - nowMs
  if (!(ms > 0)) return 'resetting'
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function clockTime(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

const CELLS = 12

function toneOf(percent: number): 'success' | 'warning' | 'error' {
  if (percent >= 90) return 'error'
  if (percent >= 70) return 'warning'
  return 'success'
}

function filledCells(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent))
  return Math.round((clamped / 100) * CELLS)
}

let meterTicker: { cancel: () => void } | undefined

// Context, rate-limit and cost meters above the prompt; tones are theme keys, so they follow the theme.
export const registerMeter: Register = on => {

  on('session.measure', async ($, e, next) => {
    await update($, snapshot, () => pick(e))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const usage = await read($, snapshot)
    if (e.props.hasSurvey || usage === null) {
      return next(e)
    }

    const nowMs = await read($, now)
    const { Box, Text } = $.ui.resolve(e)
    const { context, rateLimits, cost } = usage

    const meter = (label: string, percent: number, detail?: string) => {
      const filled = filledCells(percent)
      const tone = toneOf(percent)
      return (
        <Box key={label} flexDirection="row">
          <Box width={9}>
            <Text bold>{label}</Text>
          </Box>
          <Box width={CELLS + 2}>
            <Text color={tone}>{'█'.repeat(filled)}</Text>
            <Text dimColor>{'░'.repeat(CELLS - filled)}</Text>
          </Box>
          <Box width={6}>
            <Text color={tone}>{`${Math.round(percent)}%`.padStart(4)}</Text>
          </Box>
          {detail ? <Text dimColor>{detail}</Text> : null}
        </Box>
      )
    }

    const contextDetail = [
      context.tokens !== undefined
        ? `${Math.round(context.tokens / 1000)}k of ${Math.round(context.window / 1000)}k tokens`
        : undefined,
      cost !== undefined ? `session $${cost.toFixed(2)}` : undefined,
    ]
      .filter(Boolean)
      .join(' · ')

    const contextRow =
      context.percent !== undefined ? (
        meter('Context', context.percent, contextDetail)
      ) : (
        <Box key="context" flexDirection="row">
          <Box width={9}>
            <Text bold>Context</Text>
          </Box>
          <Text dimColor>no reading yet</Text>
        </Box>
      )

    const below = await next(e)

    return (
      <Box flexDirection="column">
        {below}
        {contextRow}
        {rateLimits.map(w =>
          meter(
            LABELS[w.kind] ?? w.kind,
            w.percentUsed,
            w.resetsAt
              ? `resets ${clockTime(w.resetsAt)} (${resetsIn(w.resetsAt, nowMs)})`
              : undefined,
          ),
        )}
      </Box>
    )
  })
}

// Runs once per session start, from the plugin's one session.start hook.
export async function startMeter($: EngineInterface) {
  meterTicker?.cancel()

  const usage = await $.session.usage()
  await update($, snapshot, () => pick(usage))
  const t = await $.clock.now()
  await update($, now, () => t)

  // Keeps the countdowns fresh between measurements.
  meterTicker = $.clock.every(60_000, () => {
    $.clock.now().then(t => update($, now, () => t))
  })

}

// ---- Theme ----
// Switches to the plugin's theme once, the first time it runs; after that the
// person's own /theme choice stands.
export async function applyThemeOnce($: EngineInterface) {
  try {
    if (await $.store.get('themeApplied')) return
    const row = (await $.config.list()).find(r => r.key === 'theme')
    const ours = row?.options?.find(o => o.includes('agent-crew'))
    if (!ours) return // theme not loaded yet: try again next session
    const answer = await $.config.set({ key: 'theme', value: ours })
    if ('deny' in answer && answer.deny) {
      $.ui.toast(`agent-crew: pick the "crew" theme with /theme (${answer.deny})`)
    } else {
      await $.store.set('themeApplied', true)
    }
  } catch {
    // a theme is cosmetic: never break a session start over it
  }
}


export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await startPane($)
    await startMeter($)
    await applyThemeOnce($)
    return next(e)
  })

  // Commits and PRs never credit Claude, on any machine with this plugin.
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
    const command = stripAttribution(e.command)
    return command === e.command ? next(e) : next({ ...e, command })
  }).catch(($, e, next) => next(e))

  registerPane(on, options)
  registerMeter(on, options)
}
