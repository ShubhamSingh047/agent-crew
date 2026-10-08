export type Tier = 'haiku' | 'sonnet' | 'opus' | 'fable'

export const MOODS: Record<Tier, { name: string; tag: string; mood: string; verb: string; color: string; rank: number }> = {
  haiku: { name: 'Haiku 5.5', tag: '◦', mood: 'breezy', verb: 'Skimming', color: '#2a9d8f', rank: 0 },
  sonnet: { name: 'Sonnet 5.5', tag: '◆', mood: 'focused', verb: 'Crafting', color: '#3d6fd6', rank: 1 },
  opus: { name: 'Opus 5.5', tag: '♛', mood: 'serene', verb: 'Conducting', color: '#8a5cc7', rank: 2 },
  fable: { name: 'Fable 5.1', tag: '😠', mood: 'furious', verb: 'Seething', color: '#d63a2f', rank: 3 },
}

export const W = 16
export const H = 12
const INK = '#141414'
const GOLD = '#e2b23a'
const STEAM = '#9a9a9a'

const BODY = [
  '..XXXXXXXXXX..',
  '.XXXXXXXXXXXX.',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  '.XXXXXXXXXXXX.',
  '..XXXXXXXXXX..',
]

type Grid = (string | null)[][]

// The same critters as the Agent Moods page: a 16x12 pixel grid per frame.
export function critter(tier: Tier, frame: number): Grid {
  const grid: Grid = Array.from({ length: H }, () => Array<string | null>(W).fill(null))
  const body = MOODS[tier].color
  let ox = 1
  let oy = 2
  if (tier === 'haiku' && frame % 2) oy -= 1
  if (tier === 'fable') ox += [0, 1, 0, -1][frame % 4]!
  const px = (x: number, y: number, c: string) => {
    const gx = ox + x
    const gy = oy + y
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) grid[gy]![gx] = c
  }
  const pts = (list: number[][], c: string) => list.forEach(([x, y]) => px(x!, y!, c))

  BODY.forEach((row, y) => [...row].forEach((ch, x) => ch === 'X' && px(x, y, body)))
  pts([[3, 8], [5, 8], [8, 8], [10, 8]], body)

  if (tier === 'haiku') {
    pts([[4, 3], [9, 3]], INK)
    if (frame % 6 !== 0) pts([[4, 4], [9, 4]], INK)
    pts([[6, 5], [7, 5]], INK)
  } else if (tier === 'sonnet') {
    pts([[3, 3], [4, 3], [9, 3], [10, 3], [6, 5], [7, 5]], INK)
    const up = frame % 2
    pts([[-1, 4 + up], [14, 5 - up]], body)
  } else if (tier === 'opus') {
    pts([[3, 4], [4, 3], [5, 4], [8, 4], [9, 3], [10, 4], [6, 5], [7, 5]], INK)
    pts([[4, -2], [7, -2], [10, -2], [4, -1], [5, -1], [6, -1], [7, -1], [8, -1], [9, -1], [10, -1]], GOLD)
  } else {
    pts([[3, 2], [4, 3], [10, 2], [9, 3], [4, 4], [9, 4], [5, 6], [6, 5], [7, 5], [8, 6]], INK)
    pts(frame % 2 ? [[1, -1], [0, -2]] : [[12, -1], [13, -2]], STEAM)
  }

  return grid
}

export type Cell = { ch: string; color?: string; backgroundColor?: string }

// Two pixel rows per text line: ▀ painted top, ▄ bottom-only, a space for neither.
export function toLines(grid: Grid): Cell[][] {
  const lines: Cell[][] = []
  const h = grid.length
  const w = grid[0]?.length ?? 0
  for (let y = 0; y < h; y += 2) {
    const line: Cell[] = []
    for (let x = 0; x < w; x++) {
      const top = grid[y]![x]
      const bottom = grid[y + 1]?.[x] ?? null
      if (top && bottom) line.push({ ch: '▀', color: top, backgroundColor: bottom })
      else if (top) line.push({ ch: '▀', color: top })
      else if (bottom) line.push({ ch: '▄', color: bottom })
      else line.push({ ch: ' ' })
    }
    lines.push(line)
  }
  return lines
}

// Merges neighbouring cells of one look into runs, so a line is a few Text elements.
export function runs(line: Cell[]): Cell[] {
  const out: Cell[] = []
  for (const c of line) {
    const last = out[out.length - 1]
    if (last && last.color === c.color && last.backgroundColor === c.backgroundColor) last.ch += c.ch
    else out.push({ ...c })
  }
  return out
}

// A half-size critter for the Agents pane: 12x6 pixels, three text lines.
const MINI = ['.XXXXXXXX.', 'XXXXXXXXXX', 'XXXXXXXXXX', '.XXXXXXXX.']

export function miniCritter(tier: Tier, frame: number): Grid {
  const w = 12
  const h = 6
  const grid: Grid = Array.from({ length: h }, () => Array<string | null>(w).fill(null))
  const body = MOODS[tier].color
  let ox = 1
  let oy = 1
  if (tier === 'haiku' && frame % 2) oy -= 1
  if (tier === 'fable') ox += [0, 1, 0, -1][frame % 4]!
  const px = (x: number, y: number, c: string) => {
    const gx = ox + x
    const gy = oy + y
    if (gx >= 0 && gx < w && gy >= 0 && gy < h) grid[gy]![gx] = c
  }
  const pts = (list: number[][], c: string) => list.forEach(([x, y]) => px(x!, y!, c))

  MINI.forEach((row, y) => [...row].forEach((ch, x) => ch === 'X' && px(x, y, body)))
  pts([[2, 4], [4, 4], [5, 4], [7, 4]], body)

  if (tier === 'haiku') {
    if (frame % 6 !== 0) pts([[3, 1], [6, 1]], INK)
    pts([[4, 2], [5, 2]], INK)
  } else if (tier === 'sonnet') {
    pts([[2, 1], [3, 1], [6, 1], [7, 1], [4, 2], [5, 2]], INK)
    pts(frame % 2 ? [[-1, 1], [10, 2]] : [[-1, 2], [10, 1]], body)
  } else if (tier === 'opus') {
    pts([[3, 1], [6, 1], [4, 2], [5, 2]], INK)
    pts([[2, -1], [4, -1], [5, -1], [7, -1]], GOLD)
  } else {
    pts([[2, 0], [3, 1], [7, 0], [6, 1], [4, 2], [5, 2]], INK)
    pts(frame % 2 ? [[0, -1]] : [[9, -1]], STEAM)
  }

  return grid
}
