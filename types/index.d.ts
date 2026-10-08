export type AgentRow = {
  id: string
  kind: string
  title: string
  status: string
  depth: number
  model?: string
}

// What the pane knows about one agent beyond the engine's list.
export type AgentDetail = {
  model?: string
  task?: string
  startedAt?: number
  tools: number
  activity?: string
  durationMs?: number
  tokens?: number
  answer?: string
}

export type UsageWindow = {
  kind: string
  percentUsed: number
  resetsAt?: string
}

export type UsageSnapshot = {
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: UsageWindow[]
  cost?: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-crew': {
      rows: AgentRow[]
      frame: number
      details: Record<string, AgentDetail>
      snapshot: UsageSnapshot | null
      now: number
    }
  }
}
