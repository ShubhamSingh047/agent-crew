# agent-crew

A Claude Code plugin that makes subagent work visible and keeps it economical.

- **Orchestration rules.** The main session (Opus 5.5) works inline by default and spawns
  agents only when they pay off (each costs ~43k tokens to start). It picks each agent's
  model, verifies results itself, and escalates a failing critical task to Opus 5.5, then
  Fable 5.1.
- **Agents pane.** Every agent in one place: a small animated pixel critter per model while
  it runs, with its task, current activity, elapsed time and tool count; when it finishes,
  its duration, tokens used and answer.
- **Usage meter** above the prompt: context used (tokens and session cost) and your 5-hour
  and 7-day rate limits with reset times. Bar colours follow the active theme.
- **The crew theme**: a dark purple theme, switched on the first time the plugin runs.
  Change it any time with `/theme`; the plugin will not switch it back.
- **Spinner words** per model: Skimming (Haiku), Crafting (Sonnet), Conducting (Opus),
  Seething (Fable).

| Model | Critter | Mood |
|---|---|---|
| Haiku 5.5 | teal, hops | breezy |
| Sonnet 5.5 | blue, types | focused |
| Opus 5.5 | purple, crowned | serene |
| Fable 5.1 | red, shakes and steams | furious |

## Install

From a terminal:

```bash
claude plugin install agent-crew --marketplace ShubhamSingh047/agent-crew
```

Then open a new Claude session. `/agent-board` reopens the Agents pane if you close it.

## Update

```bash
claude plugin marketplace update agent-crew && claude plugin update agent-crew@agent-crew
```

Then open a new Claude session.
