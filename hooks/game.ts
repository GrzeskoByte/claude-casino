// The game itself, free of the engine: outcomes, reel physics and what each frame shows.
import type { TurnUsage } from 'claude-code'

import type { Game } from '../types'
import type { Scene } from './machine'
import type { RGB } from './pixels'

export const TICK_MS = 90
// Lever knob offset from its pivot in pixels, per frame: yanked down fast, springs back slower.
export const PULL = [-20, -12, -2, 8, 16, 20, 20, 18, 14, 9, 4, -1, -6, -11, -15, -18, -20]
export const SPIN_DELAY = 4 // reels kick off as the knob passes the pivot
export const MIN_SPIN = 18 // frames the reels spin at least, however quick the turn
export const REEL_GAP = 8 // frames between each reel landing
export const SETTLE = 4 // the bounce after a reel lands
export const COUNT_FRAMES = 26 // the WIN meter rolling up
export const FLASH_FRAMES = 110 // how long the celebration keeps animating
export const HIGH_ROLLER = 1_000_000
export const SPEEDRUN_MS = 30_000

export const CHERRY = '🍒'
export const LEMON = '🍋'
export const BELL = '🔔'
export const STAR = '⭐'
export const DIAMOND = '💎'
export const SEVEN = '７'
export const COMMON = [CHERRY, LEMON, BELL, STAR]

export const STRIPS: readonly (readonly string[])[] = [
  [CHERRY, LEMON, BELL, STAR, CHERRY, DIAMOND, LEMON, BELL, CHERRY, SEVEN, STAR, LEMON],
  [STAR, CHERRY, LEMON, SEVEN, BELL, CHERRY, STAR, LEMON, DIAMOND, BELL, CHERRY, LEMON],
  [BELL, LEMON, CHERRY, STAR, DIAMOND, LEMON, BELL, CHERRY, STAR, SEVEN, LEMON, CHERRY],
]

export const WIN_QUOTES = [
  "LOOKS LIKE WE'VE GOT A WINNER!",
  'THE HOUSE LOST THIS ROUND.',
  'ABSOLUTELY MASSIVE.',
  'CHA-CHING! SHIP IT!',
  'THE TESTS ARE GREEN AND SO IS YOUR WALLET.',
  'WINNER WINNER, REFACTOR DINNER.',
]
export const LOSE_QUOTES = ['THE HOUSE WON.', 'THE HOUSE ALWAYS WINS.', 'BETTER LUCK NEXT PROMPT.', 'YOU WALKED AWAY FROM THE TABLE.']
export const QUIPS = [
  'CLAUDE IS COOKING',
  'FEELING LUCKY?',
  'COUNTING CARDS',
  'THE HOUSE IS WATCHING',
  'DOUBLING DOWN ON TOKENS',
  'NO REFUNDS ON HALLUCINATIONS',
  'LET IT RIDE!',
  'SHUFFLING THE STACK TRACES',
]

export const IDLE: Game = {
  phase: 'idle',
  isWin: false,
  turnId: null,
  pullStart: -100,
  stopFrame: 0,
  final: [9, 3, 9],
  tokens: 0,
  input: 0,
  output: 0,
  cache: 0,
  durationMs: 0,
  headline: '',
  quote: '',
  tags: [],
}

export function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T
}

export function commas(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** A meter's figure in at most 6 characters: 128420, 1.28M, 12.8M. */
export function meter(n: number): string {
  if (n < 1_000_000) return String(Math.round(n))
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function indexOf(reel: number, symbol: string): number {
  return Math.max(0, (STRIPS[reel] ?? []).indexOf(symbol))
}

export function at(reel: number, pos: number): string {
  const strip = STRIPS[reel] ?? []
  const i = Math.round(pos)
  return strip[((i % strip.length) + strip.length) % strip.length] ?? CHERRY
}

export function tokensOf(u: TurnUsage | undefined) {
  if (u === undefined) return { input: 0, output: 0, cache: 0 }
  return {
    input: u.input_tokens + u.cache_creation_input_tokens,
    output: u.output_tokens,
    cache: u.cache_read_input_tokens,
  }
}

/** Decides how the reels land and what the machine shouts. */
export function settle(g: Game, isDone: boolean, durationMs: number): Game {
  const total = g.input + g.output + g.cache
  const tags: string[] = []
  let symbols: string[]
  let headline: string
  let quote: string

  if (!isDone) {
    const a = pick(COMMON)
    const b = pick(COMMON.filter(x => x !== a))
    symbols = [a, b, pick([LEMON, CHERRY].filter(x => x !== b))]
    headline = '💀 BUST 💀'
    quote = pick(LOSE_QUOTES)
  } else {
    const roll = Math.random()
    if (roll < 0.06) {
      symbols = [SEVEN, SEVEN, SEVEN]
      headline = '🔥 MEGA JACKPOT 🔥'
      quote = 'THREE SEVENS! CALL THE PIT BOSS!'
    } else if (roll < 0.14) {
      symbols = [DIAMOND, DIAMOND, DIAMOND]
      headline = '💎 LEGENDARY WIN 💎'
      quote = 'DIAMOND HANDS. DIAMOND CODE.'
    } else if (roll < 0.26) {
      const x = pick([SEVEN, DIAMOND])
      symbols = [x, x, pick(COMMON)]
      headline = '😱 SO CLOSE! 😱'
      quote = "SO CLOSE! ...BUT THE JOB'S DONE. PAYING OUT ANYWAY."
    } else {
      const x = pick(COMMON)
      symbols = [x, x, x]
      headline = pick(['💥 JACKPOT 💥', '✨ BIG WIN ✨', '🎉 JACKPOT 🎉'])
      quote = pick(WIN_QUOTES)
    }
    if (total >= HIGH_ROLLER) tags.push('🎩 HIGH ROLLER')
    if (durationMs > 0 && durationMs < SPEEDRUN_MS) tags.push('⚡ SPEEDRUN WIN')
  }

  return {
    ...g,
    isWin: isDone,
    durationMs,
    tokens: total,
    final: symbols.map((x, reel) => indexOf(reel, x)),
    headline,
    quote,
    tags,
  }
}

/** Frame each reel lands on. */
export function stopOf(g: Game, reel: number): number {
  return g.stopFrame + REEL_GAP * (reel + 1)
}

/** Frame the last reel has finished bouncing. */
export function landedAt(g: Game): number {
  return stopOf(g, 2) + SETTLE
}

/** Symbols a reel has travelled `t` frames after kicking off: speeding up to 0.9 a frame. */
export function run(t: number): number {
  return t < 6 ? 0.075 * t * t : 2.7 + 0.9 * (t - 6)
}

export const BOUNCE = [0.18, 0.08, -0.03]

/** Where a reel's strip stands this frame (center symbol, fractional) and its speed. */
export function reelAt(g: Game, f: number, reel: number): { pos: number; speed: number } {
  const final = g.final[reel] ?? 0
  const t = f - g.pullStart - SPIN_DELAY
  if (g.phase === 'idle' || t < 0) return { pos: final, speed: 0 }
  if (g.phase === 'spinning') return { pos: final + reel * 4 + run(t), speed: Math.min(0.9, 0.15 * t) }

  // Stopping: ease out to the landing symbol, overshoot a little, settle back.
  const k = stopOf(g, reel) - f
  if (k > 6) return { pos: final - 2.7 - 0.9 * (k - 6), speed: 0.9 }
  if (k > 0) return { pos: final - 0.075 * k * k, speed: 0.15 * k }
  return { pos: final + (BOUNCE[-k - 1] ?? 0), speed: 0 }
}

export const GOLD: RGB = [255, 200, 50]
export const LED_RED: RGB = [255, 50, 40]
export const LED_AMBER: RGB = [255, 170, 0]

/** What the machine shows this frame. */
export function sceneOf(g: Game, f: number, bank: number, enabled: boolean): Scene {
  const landed = landedAt(g)
  const isOver = g.phase === 'won' || g.phase === 'lost'
  const party = isOver && f < landed + FLASH_FRAMES ? f - landed : -1
  const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
  const shown = isOver ? Math.round(g.tokens * ease((f - landed) / COUNT_FRAMES)) : 0
  const sincePull = f - g.pullStart
  const seconds = Math.floor((Math.max(0, sincePull) * TICK_MS) / 1000)
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  const mode: Scene['mode'] = !enabled ? 'off' : g.phase === 'idle' ? 'idle' : isOver ? (g.phase === 'won' ? 'won' : 'lost') : 'live'

  const crown: [string, string] =
    mode === 'off'
      ? ['CASINO', 'CLOSED']
      : mode === 'lost'
        ? ['HOUSE', 'WINS']
        : mode === 'won' && (party < 0 || f % 8 < 5)
          ? g.headline.includes('MEGA')
            ? ['MEGA', 'JACKPOT']
            : g.headline.includes('LEGEND')
              ? ['LEGEND', 'WIN!']
              : g.headline.includes('CLOSE')
                ? ['SO', 'CLOSE!']
                : ['JACK', 'POT!']
          : ['CLAUDE', 'GAMBLER']

  const ticker =
    mode === 'off'
      ? 'CLOSED'
      : mode === 'idle'
        ? 'GOOD LUCK'
        : mode === 'live'
          ? `GOOD LUCK * ${QUIPS[Math.floor(f / 60) % QUIPS.length] ?? ''} * ${clock}`
          : mode === 'won'
            ? `WINNER! * PAID ${commas(g.tokens)} TOKENS * ${g.quote}`
            : `THE HOUSE WINS * ${g.quote}`

  const meterText = mode === 'live' ? '-'.repeat(1 + (f % 6)) : mode === 'won' || mode === 'lost' ? meter(shown) : '0'
  const meterColor: RGB = mode === 'won' ? (party >= 0 && f % 2 === 0 ? [255, 255, 200] : GOLD) : mode === 'lost' ? [130, 30, 30] : mode === 'live' ? LED_AMBER : LED_RED

  return {
    f,
    reels: [0, 1, 2].map(reel => ({ ...reelAt(g, f, reel), strip: STRIPS[reel] ?? [] })),
    knob: sincePull >= 0 && sincePull < PULL.length ? (PULL[sincePull] ?? -20) : -20,
    mode,
    party,
    ticker,
    meter: meterText,
    meterColor,
    coins: mode === 'won' ? Math.min(46, Math.floor(Math.max(0, f - landed) / 2)) : 0,
    crown,
  }
}
