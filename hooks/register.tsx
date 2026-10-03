import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer, TurnUsage } from 'claude-code'

import type { Game } from '../types'
import { drawScene, SH, SW } from './machine'
import type { Scene } from './machine'
import type { RGB } from './pixels'

const PANE = 'gamble-mode'
const TITLE = '🎰 Claude Gambler'
const TICK_MS = 90
// Lever knob offset from its pivot in pixels, per frame: yanked down fast, springs back slower.
const PULL = [-20, -12, -2, 8, 16, 20, 20, 18, 14, 9, 4, -1, -6, -11, -15, -18, -20]
const SPIN_DELAY = 4 // reels kick off as the knob passes the pivot
const MIN_SPIN = 18 // frames the reels spin at least, however quick the turn
const REEL_GAP = 8 // frames between each reel landing
const SETTLE = 4 // the bounce after a reel lands
const COUNT_FRAMES = 26 // the WIN meter rolling up
const FLASH_FRAMES = 110 // how long the celebration keeps animating
const HIGH_ROLLER = 1_000_000
const SPEEDRUN_MS = 30_000

const CHERRY = '🍒'
const LEMON = '🍋'
const BELL = '🔔'
const STAR = '⭐'
const DIAMOND = '💎'
const SEVEN = '７'
const COMMON = [CHERRY, LEMON, BELL, STAR]

const STRIPS: readonly (readonly string[])[] = [
  [CHERRY, LEMON, BELL, STAR, CHERRY, DIAMOND, LEMON, BELL, CHERRY, SEVEN, STAR, LEMON],
  [STAR, CHERRY, LEMON, SEVEN, BELL, CHERRY, STAR, LEMON, DIAMOND, BELL, CHERRY, LEMON],
  [BELL, LEMON, CHERRY, STAR, DIAMOND, LEMON, BELL, CHERRY, STAR, SEVEN, LEMON, CHERRY],
]

const WIN_QUOTES = [
  "LOOKS LIKE WE'VE GOT A WINNER!",
  'THE HOUSE LOST THIS ROUND.',
  'ABSOLUTELY MASSIVE.',
  'CHA-CHING! SHIP IT!',
  'THE TESTS ARE GREEN AND SO IS YOUR WALLET.',
  'WINNER WINNER, REFACTOR DINNER.',
]
const LOSE_QUOTES = ['THE HOUSE WON.', 'THE HOUSE ALWAYS WINS.', 'BETTER LUCK NEXT PROMPT.', 'YOU WALKED AWAY FROM THE TABLE.']
const QUIPS = [
  'CLAUDE IS COOKING',
  'FEELING LUCKY?',
  'COUNTING CARDS',
  'THE HOUSE IS WATCHING',
  'DOUBLING DOWN ON TOKENS',
  'NO REFUNDS ON HALLUCINATIONS',
  'LET IT RIDE!',
  'SHUFFLING THE STACK TRACES',
]

const IDLE: Game = {
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

const game = atom({ plugin: 'gamble-mode', key: 'game' } as const, IDLE)
const frame = atom({ plugin: 'gamble-mode', key: 'frame' } as const, 0)
const bankroll = atom({ plugin: 'gamble-mode', key: 'bankroll' } as const, 0)
const isEnabled = atom({ plugin: 'gamble-mode', key: 'isEnabled' } as const, true)

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T
}

function commas(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** A meter's figure in at most 6 characters: 128420, 1.28M, 12.8M. */
function meter(n: number): string {
  if (n < 1_000_000) return String(Math.round(n))
  if (n < 10_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  return `${(n / 1_000_000).toFixed(1)}M`
}

function indexOf(reel: number, symbol: string): number {
  return Math.max(0, (STRIPS[reel] ?? []).indexOf(symbol))
}

function at(reel: number, pos: number): string {
  const strip = STRIPS[reel] ?? []
  const i = Math.round(pos)
  return strip[((i % strip.length) + strip.length) % strip.length] ?? CHERRY
}

function tokensOf(u: TurnUsage | undefined) {
  if (u === undefined) return { input: 0, output: 0, cache: 0 }
  return {
    input: u.input_tokens + u.cache_creation_input_tokens,
    output: u.output_tokens,
    cache: u.cache_read_input_tokens,
  }
}

/** Decides how the reels land and what the machine shouts. */
function settle(g: Game, isDone: boolean, durationMs: number): Game {
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
function stopOf(g: Game, reel: number): number {
  return g.stopFrame + REEL_GAP * (reel + 1)
}

/** Frame the last reel has finished bouncing. */
function landedAt(g: Game): number {
  return stopOf(g, 2) + SETTLE
}

/** Symbols a reel has travelled `t` frames after kicking off: speeding up to 0.9 a frame. */
function run(t: number): number {
  return t < 6 ? 0.075 * t * t : 2.7 + 0.9 * (t - 6)
}

const BOUNCE = [0.18, 0.08, -0.03]

/** Where a reel's strip stands this frame (center symbol, fractional) and its speed. */
function reelAt(g: Game, f: number, reel: number): { pos: number; speed: number } {
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

let ticker: Timer | undefined

function stopTicker(): void {
  ticker?.cancel()
  ticker = undefined
}

async function tick($: EngineInterface): Promise<void> {
  const now = await update($, frame, n => n + 1)
  const g = await read($, game)

  if (g.phase === 'stopping' && now >= landedAt(g)) {
    await update($, game, (cur): Game => ({ ...cur, phase: cur.isWin ? 'won' : 'lost' }))
    $.ui.toast(g.isWin ? `🎰 ${g.headline}  +${commas(g.tokens)} tokens` : '🎰 THE HOUSE WON.')
  } else if ((g.phase === 'won' || g.phase === 'lost') && now >= landedAt(g) + FLASH_FRAMES) {
    stopTicker()
  } else if (g.phase === 'idle') {
    stopTicker()
  }
}

function startTicker($: EngineInterface): void {
  if (ticker !== undefined) return
  ticker = $.clock.every(TICK_MS, () => void tick($))
}

function openPane($: EngineInterface): void {
  $.ui.open({ id: PANE, title: TITLE, columns: SW + 2 }).catch(() => {})
}

const GOLD: RGB = [255, 200, 50]
const LED_RED: RGB = [255, 50, 40]
const LED_AMBER: RGB = [255, 170, 0]

/** What the machine shows this frame. */
function sceneOf(g: Game, f: number, bank: number, enabled: boolean): Scene {
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'slot',
      description: 'Toggle gamble mode, or /slot <task> to play a prompt',
      argumentHint: '[task]',
      immediate: true,
    })
    const stored = Number((await $.store.get('bankroll')) ?? 0)
    await update($, bankroll, () => (Number.isFinite(stored) ? stored : 0))
    const enabled = await $.store.get('enabled')
    await update($, isEnabled, () => enabled !== false)

    // A reload mid-spin picks the reels back up.
    const g = await read($, game)
    if (g.phase !== 'idle') startTicker($)

    return next(e)
  })

  on('command.run', { command: 'slot' }, async ($, e) => {
    // `/slot <task>`: casino on, and the task goes to Claude as a prompt.
    const task = e.args.trim()
    if (task !== '') {
      await update($, isEnabled, () => true)
      await $.store.set('enabled', true)
      openPane($)
      $.prompt.submit({ text: task, asUser: true }).catch(() => {})
      return { text: '🎰 Lever pulled.' }
    }

    const isOn = await update($, isEnabled, was => !was)
    await $.store.set('enabled', isOn)
    if (isOn) {
      openPane($)
      return { text: '🎰 Gamble mode ON. Every prompt pulls the lever.' }
    }
    stopTicker()
    await update($, game, (): Game => IDLE)
    $.ui.status(undefined)
    await $.ui.close({ id: PANE })
    return { text: '🎰 Gamble mode OFF. The casino is closed.' }
  })

  // The person's own prompt opens the machine (so it seats at any width).
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && e.turnId === undefined && (await read($, isEnabled))) openPane($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (await read($, isEnabled)) {
      const f = await read($, frame)
      await update($, game, (cur): Game => ({ ...IDLE, final: cur.final, phase: 'spinning', turnId: e.turnId, pullStart: f + 1 }))
      startTicker($)
      openPane($)
      $.ui.status('🎰 reels spinning…')
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const g = await read($, game)
    if (g.phase !== 'spinning') return next(e)

    const used = tokensOf(e.usage)
    const add = (cur: Game): Game => ({
      ...cur,
      input: cur.input + used.input,
      output: cur.output + used.output,
      cache: cur.cache + used.cache,
    })

    // A subagent's turn: its tokens go in the pot, the reels keep spinning.
    if (e.agentId !== undefined || (g.turnId !== null && e.turnId !== g.turnId)) {
      await update($, game, add)
      return next(e)
    }

    const isDone = e.reason === 'answer'
    const f = await read($, frame)
    const settled = await update($, game, (cur): Game => ({
      ...settle(add(cur), isDone, e.durationMs),
      phase: 'stopping',
      stopFrame: Math.max(f, cur.pullStart + SPIN_DELAY + MIN_SPIN),
    }))
    startTicker($)
    $.ui.status(undefined)

    if (isDone) {
      const total = await update($, bankroll, n => n + settled.tokens)
      await $.store.set('bankroll', total)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const g = await read($, game)
    const f = await read($, frame)
    const bank = await read($, bankroll)
    const enabled = await read($, isEnabled)
    const cols = e.props.bodyColumns
    const sc = sceneOf(g, f, bank, enabled)
    const landed = landedAt(g)
    const isOver = g.phase === 'won' || g.phase === 'lost'
    const isParty = sc.party >= 0
    const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3)
    const shown = isOver ? Math.round(g.tokens * ease((f - landed) / COUNT_FRAMES)) : 0

    const result = (Box: any, Text: any) =>
      isOver && (
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          <Box borderStyle="round" borderColor={g.phase === 'won' ? 'yellow' : 'red'} paddingX={1} width={Math.max(12, Math.min(cols - 2, 44))}>
            <Text bold italic>
              “{g.quote}”
            </Text>
          </Box>
          {g.phase === 'won' ? (
            <Text bold color="yellow">
              🏆 {commas(shown)} tokens won <Text color="green">+{commas(shown)} XP</Text>
            </Text>
          ) : (
            <Text bold color="red">
              -{commas(shown)} tokens to the house
            </Text>
          )}
          <Text dimColor>
            in {commas(g.input)} · out {commas(g.output)} · cache {commas(g.cache)} · {Math.round(g.durationMs / 1000)}s
          </Text>
          {g.tags.length > 0 && (
            <Box gap={1}>
              {g.tags.map(tag => (
                <Text bold inverse color={f % 2 === 0 && isParty ? 'magenta' : 'cyan'}>
                  {' '}
                  {tag}{' '}
                </Text>
              ))}
            </Box>
          )}
          <Text dimColor>🏦 Lifetime winnings: {commas(bank)} tokens</Text>
        </Box>
      )

    if (e.surface === 'terminal') {
      const { Box, Text, Raster } = $.ui.resolve(e)
      return (
        <Box flexDirection="column" alignItems="center">
          <Raster key="machine" columns={SW} rows={SH / 2} cells={drawScene(sc).cells()} />
          {result(Box, Text)}
        </Box>
      )
    }

    // Surfaces without a pixel grid get the reels as text.
    const { Box, Text } = $.ui.resolve(e)
    const row = (offset: number) => sc.reels.map((r, i) => at(i, Math.round(r.pos) + offset)).join(' │ ')
    return (
      <Box flexDirection="column" alignItems="center">
        <Text bold color="yellow">
          🎰 {sc.crown.join(' ')} 🎰
        </Text>
        <Box flexDirection="column" alignItems="center" borderStyle="double" borderColor={g.phase === 'lost' ? 'red' : 'yellow'} paddingX={1}>
          <Text dimColor>{row(1)}</Text>
          <Text bold>▶ {row(0)} ◀</Text>
          <Text dimColor>{row(-1)}</Text>
        </Box>
        <Text color="yellow">{sc.ticker}</Text>
        <Text bold>WIN {sc.meter}</Text>
        {result(Box, Text)}
      </Box>
    )
  })
}
