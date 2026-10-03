// The slot machine scene, drawn pixel by pixel into a Canvas.
import { Canvas, mix, PH, PW, shade, spritePixel, text, textWidth } from './pixels'
import type { RGB } from './pixels'

export type Scene = {
  f: number
  /** Center symbol of each reel as a float strip position, and its speed in symbols a frame. */
  reels: { pos: number; speed: number; strip: readonly string[] }[]
  /** Lever knob offset from the pivot in pixels: -20 up (rest) to +20 down. */
  knob: number
  mode: 'off' | 'idle' | 'live' | 'won' | 'lost'
  /** Celebration frames since the last reel settled; -1 outside one. */
  party: number
  ticker: string
  meter: string
  meterColor: RGB
  /** Coins in the tray. */
  coins: number
  /** Crown lettering, two lines. */
  crown: [string, string]
}

const CAB: RGB = [150, 24, 28]
const CAB_DARK: RGB = [70, 8, 12]
const CHROME_HI: RGB = [245, 245, 250]
const CHROME_LO: RGB = [90, 92, 100]
const GOLD: RGB = [255, 200, 50]
const GOLD_DIM: RGB = [110, 70, 10]
const LED_BG: RGB = [12, 10, 10]
const LED_RED: RGB = [255, 50, 40]
const LED_AMBER: RGB = [255, 170, 0]
const IVORY: RGB = [246, 242, 228]
const GAP: RGB = [25, 22, 22]
const WHITE: RGB = [255, 255, 255]
const RAINBOW: RGB[] = [
  [255, 60, 60],
  [255, 170, 0],
  [255, 240, 60],
  [60, 220, 90],
  [60, 180, 255],
  [200, 90, 255],
]

const CX = 23.5 // cabinet axis
const CY = 41 // payline row
const DRUM_R = 13 // reel drum radius in pixels (window is 2R-1 tall)
const PITCH = 12 // pixels between symbols along the strip
const SYMBOL_ART: Record<string, string> = {
  '🍒': 'cherry',
  '🍋': 'lemon',
  '🔔': 'bell',
  '⭐': 'star',
  '💎': 'diamond',
  '７': 'seven',
}

function rainbow(i: number): RGB {
  return RAINBOW[((i % RAINBOW.length) + RAINBOW.length) % RAINBOW.length] ?? GOLD
}

/** Chrome: bright along the top-left, falling off to the lower right. */
function chrome(x: number, y: number, x0: number, y0: number, x1: number, y1: number): RGB {
  const t = ((x - x0) / Math.max(1, x1 - x0)) * 0.4 + ((y - y0) / Math.max(1, y1 - y0)) * 0.6
  const band = 0.5 + 0.5 * Math.cos(t * Math.PI * 1.6)
  return mix(CHROME_LO, CHROME_HI, band)
}

/** The cabinet's red: a curved body with a soft highlight a third of the way across. */
function body(x: number, y: number): RGB {
  const u = (x - 1) / 45
  const f = 0.5 + 0.45 * Math.sin(Math.PI * u) + 0.35 * Math.exp(-(((x - 13) / 4.5) ** 2)) - (y > 60 ? 0.08 : 0)
  return shade(CAB, f)
}

function archTop(x: number): number {
  const u = (x - CX) / 23
  return 3 + Math.round(11 * (1 - Math.sqrt(Math.max(0, 1 - u * u))))
}

export function draw(sc: Scene): Canvas {
  const cv = new Canvas()
  const { f, mode } = sc
  const isParty = sc.party >= 0
  const isWon = mode === 'won' && isParty
  const isLost = mode === 'lost'
  const isLive = mode === 'live'

  // Candle light on top.
  const candle: RGB =
    mode === 'off' ? [80, 80, 80] : isWon ? (f % 2 === 0 ? [255, 40, 40] : WHITE) : isLost ? [200, 20, 20] : isLive ? (f % 6 < 3 ? LED_AMBER : [110, 60, 0]) : [210, 210, 210]
  cv.rect(21, 0, 26, 2, (x, y) => (x === 22 && y < 2 ? mix(candle, WHITE, 0.6) : shade(candle, x === 26 ? 0.7 : 1)))
  if (isLive || isWon) for (const [x, y] of [[20, 1], [27, 1], [23, -1]] as const) cv.blend(x, y, candle, 0.35)

  // Arched topper with a gold rim and bulbs.
  for (let x = 1; x <= 46; x++) {
    const top = archTop(x)
    for (let y = top; y <= 17; y++) {
      const depth = (y - top) / Math.max(1, 17 - top)
      cv.set(x, y, shade(CAB_DARK, 1.25 - 0.4 * depth + 0.25 * Math.exp(-(((x - 15) / 6) ** 2))))
    }
    cv.set(x, top, GOLD)
    if (x === 1 || x === 46) for (let y = top; y <= 17; y++) cv.set(x, y, GOLD)
  }
  for (let i = 0, x = 3; x <= 44; x += 3, i++) {
    const isOn = mode === 'off' ? false : isWon ? (i + f) % 2 === 0 : isLive ? (i + f) % 4 === 0 : i % 3 === 0
    const y = archTop(x)
    const c = isWon ? rainbow(i + f) : isLost && isParty ? [255, 30, 30] as RGB : GOLD
    cv.set(x, y, isOn ? mix(c, WHITE, 0.5) : GOLD_DIM)
    if (isOn) {
      cv.blend(x, y + 1, c, 0.45)
      cv.blend(x - 1, y, c, 0.3)
      cv.blend(x + 1, y, c, 0.3)
    }
  }
  const [lineA, lineB] = sc.crown
  const crownColor = (i: number, _x: number, y: number): RGB =>
    mode === 'off' ? [120, 100, 60] : isWon ? rainbow(i + f) : isLost && isParty ? [255, 60, 50] : mix(GOLD, [255, 250, 200], y % 6 < 2 ? 0.5 : 0)
  text(cv, lineA, Math.round(CX - textWidth(lineA) / 2 + 0.5), 6, crownColor)
  text(cv, lineB, Math.round(CX - textWidth(lineB) / 2 + 0.5), 12, crownColor)

  // Chrome band, then the cabinet body with chrome side trims.
  cv.rect(1, 18, 46, 19, (x, y) => chrome(x, y, 1, 18, 46, 19))
  cv.rect(1, 20, 46, 72, body)
  cv.rect(1, 20, 1, 72, (x, y) => chrome(x, y, 0, 20, 2, 72))
  cv.rect(46, 20, 46, 72, (_x, y) => shade(chrome(46, y, 0, 20, 2, 72), 0.6))

  // LED message display.
  cv.rect(5, 20, 42, 26, (x, y) => (x === 5 || x === 42 || y === 20 || y === 26 ? [50, 50, 55] : LED_BG))
  const msgWidth = textWidth(sc.ticker) + 1
  const scroll = mode === 'off' || mode === 'idle' ? 0 : f % (msgWidth + 36)
  const tx = mode === 'off' || mode === 'idle' ? Math.round(CX - msgWidth / 2 + 0.5) : 42 - scroll
  const tickColor = isWon ? (i: number) => rainbow(i + f) : () => (isLost ? LED_RED : LED_AMBER)
  text(cv, sc.ticker, tx, 21, i => tickColor(i), 6, 41)

  // Reel window: a chrome bezel around three drums.
  cv.rect(3, CY - DRUM_R - 1, 44, CY + DRUM_R + 1, (x, y) => chrome(x, y, 3, CY - DRUM_R - 1, 44, CY + DRUM_R + 1))
  cv.rect(4, CY - DRUM_R, 43, CY + DRUM_R, () => GAP)
  sc.reels.forEach((reel, i) => drawReel(cv, reel, 5 + i * 13, sc, isWon))
  // Glass: two diagonal glare streaks over the drums.
  for (let y = CY - DRUM_R + 1; y < CY + DRUM_R; y++)
    for (let x = 5; x <= 42; x++) {
      const d = x - 8 - (y - (CY - DRUM_R)) * 0.55
      if (d >= 0 && d < 2.5) cv.blend(x, y, WHITE, 0.22)
      if (d >= 5 && d < 6) cv.blend(x, y, WHITE, 0.12)
    }
  // Payline arrows on the bezel.
  for (const [dx, dy] of [[0, -1], [0, 0], [0, 1], [1, 0]] as const) {
    cv.set(3 + dx, CY + dy, isWon && f % 2 === 0 ? GOLD : LED_RED)
    cv.set(44 - dx, CY + dy, isWon && f % 2 === 0 ? GOLD : LED_RED)
  }

  // WIN meter.
  cv.rect(5, 57, 42, 63, (x, y) => (x === 5 || x === 42 || y === 57 || y === 63 ? [50, 50, 55] : LED_BG))
  if (sc.meter.length < 6) text(cv, 'WIN', 6, 58, () => GOLD) // a full meter needs the room
  text(cv, sc.meter, 41 - textWidth(sc.meter), 58, () => sc.meterColor)

  // Button deck: a chrome lip and four lit buttons.
  cv.rect(3, 65, 44, 65, (x, y) => chrome(x, y, 3, 64, 44, 66))
  cv.rect(3, 66, 44, 68, (_x, y) => shade([55, 55, 60], 1 - (y - 66) * 0.15))
  const buttons: [number, RGB][] = [
    [6, [250, 210, 30]],
    [14, [60, 130, 250]],
    [22, [40, 200, 80]],
    [30, [235, 50, 50]],
    [38, [240, 240, 240]],
  ]
  buttons.forEach(([bx, c], i) => {
    const isLit = isLive ? (f + i) % 5 === 0 : isWon ? (f + i) % 2 === 0 : mode === 'idle' && i === 2
    const w = i === 4 ? 4 : 5
    cv.rect(bx, 66, bx + w - 1, 67, (x, y) => (y === 66 && x < bx + w - 1 ? mix(c, WHITE, isLit ? 0.55 : 0.1) : shade(c, isLit ? 1 : 0.35)))
  })

  // Coin tray with the payout piling up.
  cv.rect(9, 69, 38, 71, (x, y) => (y === 69 ? [8, 8, 8] : mix([20, 20, 20], [45, 45, 45], (x - 9) / 29)))
  cv.rect(8, 72, 39, 72, (x, y) => chrome(x, y, 8, 71, 39, 73))
  for (let i = 0; i < sc.coins; i++) {
    const x = 10 + ((i * 7) % 28)
    const y = i < 28 ? 71 : 70
    cv.set(x, y, i % 3 === 0 ? [255, 240, 150] : GOLD)
  }

  // Base and feet.
  cv.rect(0, 73, 47, 74, (x, y) => (y === 73 ? chrome(x, y, 0, 72, 47, 75) : shade(CAB_DARK, 0.6)))
  cv.rect(2, 75, 6, 75, () => [30, 30, 32])
  cv.rect(41, 75, 45, 75, () => [30, 30, 32])

  drawLever(cv, sc.knob)

  // Coins bursting out of the tray on a win.
  if (isWon) {
    for (let i = 0; i < 22; i++) {
      const t = sc.party - i * 2
      if (t < 0) continue
      const vx = (i % 2 === 0 ? 1 : -1) * (0.5 + ((i * 37) % 10) / 9)
      const vy = 2.4 + ((i * 53) % 10) / 7
      const x = 24 + vx * t
      const y = 69 - vy * t + 0.11 * t * t
      if (y > PH - 1 || x < 0 || x > PW - 1) continue
      cv.set(x, y, (t + i) % 4 < 2 ? [255, 245, 170] : GOLD)
      cv.set(x + 1, y, shade(GOLD, 0.7))
    }
  }

  return cv
}

/** One reel: a lit cylinder seen head-on, the strip wrapped around it. */
function drawReel(cv: Canvas, reel: Scene['reels'][number], x0: number, sc: Scene, isWon: boolean): void {
  const { pos, speed, strip } = reel
  const blur = Math.min(1, Math.max(0, (speed - 0.25) / 0.6))
  for (let y = CY - DRUM_R + 1; y < CY + DRUM_R; y++) {
    // Project the screen row onto the drum: angle from the viewer, arc length along the strip.
    const h = (y - CY) / DRUM_R
    const angle = Math.asin(Math.max(-1, Math.min(1, h)))
    const arc = angle * DRUM_R
    const light = 0.25 + 0.75 * Math.cos(angle) ** 1.4
    for (let x = x0; x < x0 + 11; x++) {
      const side = 1 - 0.18 * Math.abs(x - (x0 + 5)) / 5
      let paper: RGB = shade(IVORY, light * side)
      if (isWon && sc.f % 2 === 0 && Math.abs(y - CY) <= 5) paper = mix(paper, [255, 215, 80], 0.45)
      if (sc.mode === 'lost') paper = shade(paper, 0.7)
      // Motion blur: average a few samples spread along the travel.
      const samples = blur > 0 ? 4 : 1
      let acc: RGB = [0, 0, 0]
      for (let k = 0; k < samples; k++) {
        const along = pos * PITCH - arc - k * blur * speed * PITCH * 0.15
        const ink = symbolAt(strip, along, x - x0 - 1)
        acc = mix(acc, ink === undefined ? paper : mix(paper, ink, light > 0.5 ? 1 : 0.6 + light * 0.4), 1 / (k + 1))
      }
      cv.set(x, y, acc)
    }
  }
}

/** The ink at `along` pixels down the strip, `col` pixels into the 9-wide art; undefined on paper. */
function symbolAt(strip: readonly string[], along: number, col: number): RGB | undefined {
  if (col < 0 || col > 8) return undefined
  const j = Math.round(along / PITCH)
  const local = Math.round(along - j * PITCH) + 4 // 0..8 inside the art
  const sym = strip[((j % strip.length) + strip.length) % strip.length] ?? ''
  // Strip index grows upward on screen, so art rows run against `along`.
  return spritePixel(SYMBOL_ART[sym] ?? 'cherry', col, 8 - local)
}

/** The lever: a chrome mount, an arm and a red ball knob with a highlight. */
function drawLever(cv: Canvas, knob: number): void {
  cv.rect(47, CY - 3, 49, CY + 3, (x, y) => chrome(x, y, 47, CY - 3, 49, CY + 3))
  const ky = CY + knob
  const step = ky < CY ? -1 : 1
  for (let y = CY; y !== ky; y += step) {
    cv.set(51, y, mix(CHROME_HI, CHROME_LO, 0.3))
    cv.set(52, y, CHROME_LO)
  }
  cv.set(50, CY, CHROME_LO)
  // Pointing at the viewer the ball looks bigger.
  const r = Math.abs(knob) < 6 ? 3 : 2.3
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const d2 = dx * dx + dy * dy
      if (d2 > r * r) continue
      const lit = 1.15 - (dx + dy + 3) * 0.1
      cv.set(51.5 + dx, ky + dy, d2 <= 1 && dx <= 0 && dy <= 0 ? [255, 170, 170] : shade([220, 30, 30], lit))
    }
}

// Bold 6x9 lettering for the sign.
// prettier-ignore
const BIG: Record<string, string[]> = {
  J: ['..####', '..####', '....##', '....##', '....##', '##..##', '##..##', '######', '.####.'],
  A: ['..##..', '.####.', '##..##', '##..##', '######', '######', '##..##', '##..##', '##..##'],
  C: ['.#####', '######', '##....', '##....', '##....', '##....', '##....', '######', '.#####'],
  K: ['##..##', '##.##.', '####..', '###...', '###...', '####..', '##.##.', '##..##', '##..##'],
  P: ['#####.', '######', '##..##', '##..##', '######', '#####.', '##....', '##....', '##....'],
  O: ['.####.', '######', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
  T: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  B: ['#####.', '######', '##..##', '#####.', '#####.', '##..##', '##..##', '######', '#####.'],
  U: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
  I: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..', '######', '######'],
  N: ['##..##', '###.##', '######', '######', '##.###', '##..##', '##..##', '##..##', '##..##'],
  S: ['.#####', '######', '##....', '#####.', '.#####', '....##', '....##', '######', '#####.'],
  '!': ['..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '......', '..##..', '..##..'],
}

function bigText(cv: Canvas, word: string, x: number, y: number, color: (i: number, x: number, y: number) => RGB): void {
  ;[...word].forEach((ch, i) =>
    (BIG[ch] ?? []).forEach((row, r) =>
      [...row].forEach((bit, c) => {
        if (bit === '#') cv.set(x + i * 8 + c, y + r, color(i, x + i * 8 + c, y + r))
      }),
    ),
  )
}

export const SIGN_H = 24 // pixels down (12 terminal rows)

/** The comic-burst sign over the machine: JACKPOT on a win, BUST on a loss. */
export function drawSign(sc: Scene): Canvas {
  const cv = new Canvas(PW, SIGN_H)
  const { f } = sc
  const isWon = sc.mode === 'won'
  const isParty = sc.party >= 0
  const cx = (PW - 1) / 2
  const cy = (SIGN_H - 1) / 2
  const spin = isParty ? f * 0.12 : 0
  const points = 14

  // Jagged starburst, squashed to the sign's shape; the rays turn while it celebrates.
  const rim = (a: number) => {
    const k = ((a / (Math.PI * 2)) * points * 2 + 1000) % 2
    const tip = k < 1 ? k : 2 - k
    return 0.95 + 0.4 * tip
  }
  for (let y = 0; y < SIGN_H; y++)
    for (let x = 0; x < PW; x++) {
      const dx = (x - cx) / (PW / 2)
      const dy = (y - cy) / (SIGN_H / 2)
      const a = Math.atan2(dy, dx)
      const d = Math.hypot(dx, dy)
      const edge = rim(a + spin * 0.3)
      if (d > edge) continue
      if (d > edge - 0.09) {
        cv.set(x, y, [20, 10, 10])
        continue
      }
      const ray = Math.floor(((a + spin + Math.PI) / (Math.PI * 2)) * 24) % 2 === 0
      const base: RGB = isWon ? (ray ? [255, 205, 40] : [255, 140, 20]) : ray ? [150, 20, 20] : [95, 10, 10]
      const glow = 1.15 - d * 0.45
      cv.set(x, y, shade(base, glow))
    }

  // Big lettering with a black outline and drop shadow, comic style.
  const word = isWon ? 'JACKPOT' : 'BUST!'
  const tx = Math.round(cx - (word.length * 8 - 2) / 2 + 0.5)
  const ty = Math.round(cy - 4)
  const ink: RGB = [15, 8, 8]
  for (const [ox, oy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [1, 1], [1, 2], [2, 2]] as const) bigText(cv, word, tx + ox, ty + oy, () => ink)
  const fillColor = (i: number, _x: number, y: number): RGB => {
    if (!isWon) return y < ty + 4 ? [255, 255, 255] : [255, 200, 190]
    if (isParty) return mix(rainbow(i + Math.floor(f / 2)), WHITE, y < ty + 2 ? 0.5 : 0)
    return y < ty + 4 ? [255, 255, 255] : [255, 70, 70]
  }
  bigText(cv, word, tx, ty, fillColor)

  // Twinkling sparkles around the burst while it celebrates.
  if (isParty && isWon)
    for (let i = 0; i < 10; i++) {
      const sx = (i * 23 + f * 5) % PW
      const sy = (i * 7 + f * 3) % SIGN_H
      if ((f + i) % 3 !== 0) continue
      cv.set(sx, sy, WHITE)
      cv.blend(sx - 1, sy, WHITE, 0.5)
      cv.blend(sx + 1, sy, WHITE, 0.5)
      cv.blend(sx, sy - 1, WHITE, 0.5)
      cv.blend(sx, sy + 1, WHITE, 0.5)
    }

  return cv
}

export const SW = 76 // scene pixels across (terminal columns)
export const SH = 112 // scene pixels down (two per terminal row)
const MX = 10 // where the machine stands in the scene
const MY = 25
const HORIZON = 84 // where the wall meets the carpet

/** The whole picture: the casino behind, the sign on the wall, the machine on the carpet. */
export function drawScene(sc: Scene): Canvas {
  const cv = new Canvas(SW, SH)
  const { f, mode } = sc
  const isWon = mode === 'won' && sc.party >= 0
  const isOver = mode === 'won' || mode === 'lost'

  // Wall: deep burgundy, striped wallpaper with a faint damask dot, darker toward the corners.
  for (let y = 0; y < HORIZON; y++)
    for (let x = 0; x < SW; x++) {
      const vignette = 1 - 0.55 * Math.abs(x - SW / 2) / (SW / 2) - 0.25 * (1 - y / HORIZON)
      const stripe = x % 6 < 3 ? 1 : 0.88
      const damask = (x % 6 === 4 && y % 6 === 2) || (x % 6 === 1 && y % 6 === 5) ? 1.25 : 1
      let c = shade([58, 14, 30], vignette * stripe * damask)
      if (isWon) c = mix(c, rainbow(Math.floor((x + f) / 12)), 0.12)
      cv.set(x, y, c)
    }
  // Wainscot rail along the bottom of the wall.
  for (let x = 0; x < SW; x++) {
    cv.set(x, HORIZON - 9, [120, 85, 30])
    for (let y = HORIZON - 8; y < HORIZON; y++) cv.set(x, y, shade([45, 18, 12], 0.8 + (x % 8 === 0 ? -0.3 : 0)))
  }

  // Ceiling lights with warm cones falling down the wall.
  for (let i = 0; i < 5; i++) {
    const lx = 6 + i * 16
    const isOn = mode === 'off' ? false : isWon ? (f + i) % 2 === 0 : true
    const warm: RGB = isWon ? rainbow(i + f) : [255, 210, 140]
    cv.set(lx, 0, isOn ? WHITE : [90, 80, 60])
    cv.set(lx + 1, 0, isOn ? WHITE : [90, 80, 60])
    if (!isOn) continue
    for (let y = 1; y < 30; y++) {
      const half = 1 + y * 0.35
      for (let x = Math.floor(lx - half); x <= Math.ceil(lx + 1 + half); x++) cv.blend(x, y, warm, 0.16 * (1 - y / 30))
    }
  }

  // Background machines on both sides, dimmer and smaller, their screens blinking.
  const rowMachine = (x0: number, seed: number) => {
    const top = HORIZON - 30
    cv.rect(x0, top, x0 + 11, HORIZON + 1, (x, y) => shade([70, 20, 70], 0.55 + 0.3 * Math.sin(((x - x0) / 11) * Math.PI) - (y > HORIZON - 6 ? 0.15 : 0)))
    cv.rect(x0 + 1, top - 3, x0 + 10, top - 1, () => [40, 12, 40])
    const light: RGB = mode === 'off' ? [60, 60, 60] : (f + seed) % 10 < 5 ? [255, 120, 40] : [255, 220, 90]
    cv.rect(x0 + 4, top - 5, x0 + 7, top - 4, () => light)
    for (let r = 0; r < 3; r++)
      cv.rect(x0 + 2 + r * 3, top + 7, x0 + 3 + r * 3, top + 12, () =>
        mode === 'off' ? [30, 30, 30] : shade(rainbow(Math.floor((f + seed * 3) / (4 + r)) + r), 0.75),
      )
    cv.rect(x0 + 2, top + 16, x0 + 9, top + 17, () => [20, 8, 8])
    cv.rect(x0 + 3, top + 16, x0 + 3 + ((f + seed) % 6), top + 16, () => (mode === 'off' ? [40, 40, 40] : [255, 60, 40]))
  }
  rowMachine(-3, 1)
  rowMachine(SW - 9, 4)

  // Carpet: red with a gold diamond pattern, seen in perspective, fading into the dark.
  for (let y = HORIZON; y < SH; y++) {
    const z = 30 / (y - HORIZON + 4)
    for (let x = 0; x < SW; x++) {
      // A diamond lattice: gold lines where u+v or u-v crosses a whole number.
      const u = ((x - SW / 2) * z) / 9
      const v = z * 1.4
      const p = u + v
      const q = u - v
      const line = Math.min(Math.abs(p - Math.round(p)), Math.abs(q - Math.round(q)))
      const isGold = line < 0.06 + 0.05 / z
      const isDark = ((Math.floor(p) + Math.floor(q)) & 1) === 1
      const near = 0.45 + 0.55 * ((y - HORIZON) / (SH - HORIZON))
      let c: RGB = isGold ? [200, 150, 50] : isDark ? [100, 12, 22] : [135, 20, 30]
      c = shade(c, near)
      if (isWon) c = mix(c, rainbow(Math.floor(p) + Math.floor(f / 3)), 0.12)
      cv.set(x, y, c)
    }
  }

  // The machine's shadow on the carpet.
  const foot = MY + 75
  for (let y = foot - 4; y < SH; y++)
    for (let x = MX - 6; x <= MX + 56; x++) {
      const dx = (x - (MX + 25)) / 31
      const dy = (y - (foot + 1)) / 5
      if (dx * dx + dy * dy < 1) cv.blend(x, y, [10, 0, 0], 0.55)
    }

  // On the wall: the result sign, or a flickering neon CASINO.
  if (isOver) cv.paste(drawSign(sc), MX, 0)
  else neon(cv, 'CASINO', mode === 'off' ? -1 : f)

  cv.paste(draw(sc), MX, MY)
  return cv
}

/** Neon tube lettering with a glow; a letter now and then flickers. `f` -1 is switched off. */
function neon(cv: Canvas, word: string, f: number): void {
  const tube: RGB = [255, 60, 200]
  const x0 = Math.round((SW - (word.length * 8 - 2)) / 2)
  const y0 = 7
  const lit = (i: number) => f >= 0 && !((f + i * 7) % 53 < 2)
  // Backboard.
  cv.rect(x0 - 4, y0 - 3, x0 + word.length * 8 + 1, y0 + 11, (x, y) => (x === x0 - 4 || y === y0 - 3 || x === x0 + word.length * 8 + 1 || y === y0 + 11 ? [30, 25, 35] : [18, 10, 20]))
  ;[...word].forEach((_, i) => {
    const glow = lit(i)
    const color: RGB = glow ? tube : [90, 40, 80]
    bigText(cv, word[i] ?? '', x0 + i * 8, y0, (_i, x, y) => {
      if (glow)
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) cv.blend(x + dx, y + dy, tube, 0.25)
      return glow && (x + y) % 3 === 0 ? mix(color, WHITE, 0.5) : color
    })
  })
}
