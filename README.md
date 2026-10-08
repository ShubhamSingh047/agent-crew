# agent-crew

A Claude Code plugin that makes subagent work visible and keeps it economical.

- **Orchestration rules.** The main session (Opus 5.5) works inline by default and spawns
  agents only when they pay off (each costs ~43k tokens to start). It picks each agent's
  model, verifies results itself, and escalates a failing critical task to Opus 5.5, then
  Fable 5.1.
- **Agents pane.** Every agent in one place: a small animated pixel critter per model while
  it runs, with its task, current activity, elapsed time and tool count; when it finishes,
  its duration, tokens used and answer.
- **Spinner words** per model: Skimming (Haiku), Crafting (Sonnet), Conducting (Opus),
  Seething (Fable).

| Model | Critter | Mood |
|---|---|---|
| Haiku 5.5 | teal, hops | breezy |
| Sonnet 5.5 | blue, types | focused |
| Opus 5.5 | purple, crowned | serene |
| Fable 5.1 | red, shakes and steams | furious |

## Install

In a terminal session of Claude Code:

```
/plugin install agent-crew --marketplace ShubhamSingh047/agent-crew
```

Answer `y` to add the marketplace, then pick the user scope. It is active right away.
`/agent-board` reopens the Agents pane if you close it.
