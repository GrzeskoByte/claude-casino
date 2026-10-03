import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Game } from '../types'
import { COUNT_FRAMES, FLASH_FRAMES, IDLE, MIN_SPIN, SPIN_DELAY, TICK_MS, at, commas, landedAt, sceneOf, settle, tokensOf } from './game'
import { drawScene, SH, SW } from './machine'

const PANE = 'gamble-mode'
const TITLE = '🎰 Claude Gambler'

const game = atom({ plugin: 'gamble-mode', key: 'game' } as const, IDLE)
const frame = atom({ plugin: 'gamble-mode', key: 'frame' } as const, 0)
const bankroll = atom({ plugin: 'gamble-mode', key: 'bankroll' } as const, 0)
const isEnabled = atom({ plugin: 'gamble-mode', key: 'isEnabled' } as const, true)

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
