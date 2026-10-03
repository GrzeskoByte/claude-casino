import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

/** The engine's side of everything the mod calls. */
function world(on: On) {
  const clock = mock.clock(on)
  mock.store(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context, origin: e.origin }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer, usage: e.usage }))
  return clock
}

const PANE = {
  plugin: 'gamble-mode',
  component: 'Pane',
  requestId: 'gamble-mode',
  props: {
    title: '🎰 Claude Gambler',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const USAGE = {
  model: 'claude-opus-5-5',
  input_tokens: 1000,
  output_tokens: 420,
  cache_read_input_tokens: 127000,
  cache_creation_input_tokens: 0,
}

test('every prompt pulls the lever, spins, then pays out the tokens', async ($, on) => {
  const clock = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'build auth', turnId: 't1' })

  await clock.advance(90 * 3) // knob on its way down
  const pixels = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pixels.find({ type: 'Raster', key: 'machine' })).toBeDefined()
  await pixels.unmount()
  const text = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await text.find({ type: 'Text', text: /GOOD LUCK/ })).toBeDefined()
  await text.unmount()
  await clock.advance(90 * 20)

  await $.turn.complete({ answer: 'Done.', durationMs: 90_000, isAborted: false, turnId: 't1', reason: 'answer', usage: USAGE })
  await clock.advance(90 * 80)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /128,420 tokens won/ })).toBeDefined()
    if (surface === 'terminal') expect(await ui.find({ type: 'Raster', key: 'machine' })).toBeDefined()
    await ui.unmount()
  }
})

test('an interrupted task means the house won', async ($, on) => {
  const clock = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'refactor everything', turnId: 't2' })
  await clock.advance(300)
  await $.turn.complete({ answer: '', durationMs: 4000, isAborted: true, turnId: 't2', reason: 'aborted' })
  await clock.advance(90 * 80)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /tokens to the house/ })).toBeDefined()
})

test('/slot switches the casino off, and turns then leave the reels alone', async ($, on) => {
  const clock = world(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const off = await $.command.run({ command: 'slot', args: '' })
  expect(off.text).toContain('OFF')
  await $.turn.start({ text: 'hi', turnId: 't3' })
  await clock.advance(1000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster', key: 'machine' })).toBeDefined()
})
