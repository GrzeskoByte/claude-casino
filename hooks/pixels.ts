// A tiny framebuffer and the art drawn into it: packed two pixels to a terminal cell.

export type RGB = readonly [number, number, number]

export const PW = 56 // pixels across (terminal columns)
export const PH = 76 // pixels down (two per terminal row)

const NONE = -1

export class Canvas {
  readonly px: Int32Array

  constructor(
    readonly w = PW,
    readonly h = PH,
  ) {
    this.px = new Int32Array(w * h).fill(NONE)
  }

  set(x: number, y: number, c: RGB): void {
    const xi = Math.round(x)
    const yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return
    this.px[yi * this.w + xi] = pack(c)
  }

  get(x: number, y: number): RGB | undefined {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return undefined
    const v = this.px[y * this.w + x] ?? NONE
    return v === NONE ? undefined : unpack(v)
  }

  /** Mixes `c` over what is there by `t` (0 keeps it, 1 replaces it). */
  blend(x: number, y: number, c: RGB, t: number): void {
    const under = this.get(x, y)
    this.set(x, y, under === undefined ? c : mix(under, c, t))
  }

  /** Paints `src` over this canvas at (ox, oy); its empty pixels let this one show through. */
  paste(src: Canvas, ox: number, oy: number): void {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y)
        if (c !== undefined) this.set(ox + x, oy + y, c)
      }
  }

  rect(x0: number, y0: number, x1: number, y1: number, color: (x: number, y: number) => RGB): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, color(x, y))
  }

  /** The cells of a Raster: `▀` with the upper pixel as foreground, the lower as background. */
  cells(): string {
    const rows = this.h / 2
    const view = new DataView(new ArrayBuffer(this.w * rows * 12))
    let o = 0
    for (let r = 0; r < rows; r++) {
      for (let x = 0; x < this.w; x++) {
        const top = this.px[2 * r * this.w + x] ?? NONE
        const bottom = this.px[(2 * r + 1) * this.w + x] ?? NONE
        const DEFAULT = 0x01000000
        let glyph = 0x2580
        let fg = top
        let bg = bottom
        if (top === NONE && bottom === NONE) {
          glyph = 0x20
          fg = DEFAULT
          bg = DEFAULT
        } else if (top === NONE) {
          glyph = 0x2584
          fg = bottom
          bg = DEFAULT
        } else if (bottom === NONE) {
          bg = DEFAULT
        }
        view.setUint32(o, glyph, true)
        view.setUint32(o + 4, fg, true)
        view.setUint32(o + 8, bg, true)
        o += 12
      }
    }
    return base64(new Uint8Array(view.buffer))
  }
}

export function pack([r, g, b]: RGB): number {
  return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b)
}

function unpack(v: number): RGB {
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function shade(c: RGB, f: number): RGB {
  return [c[0] * f, c[1] * f, c[2] * f]
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += B64[(n >> 18) & 63]
    out += B64[(n >> 12) & 63]
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? B64[n & 63] : '='
  }
  return out
}

// prettier-ignore
const FONT: Record<string, string> = {
  'A': '.#.#.#####.##.#',
  'B': '##.#.###.#.###.',
  'C': '.###..#..#...##',
  'D': '##.#.##.##.###.',
  'E': '####..##.#..###',
  'F': '####..##.#..#..',
  'G': '.###..#.##.#.##',
  'H': '#.##.#####.##.#',
  'I': '###.#..#..#.###',
  'J': '..#..#..##.#.#.',
  'K': '#.##.###.#.##.#',
  'L': '#..#..#..#..###',
  'M': '#.########.##.#',
  'N': '##.#.##.##.##.#',
  'O': '.#.#.##.##.#.#.',
  'P': '##.#.###.#..#..',
  'Q': '.#.#.##.###..##',
  'R': '##.#.###.#.##.#',
  'S': '.###...#...###.',
  'T': '###.#..#..#..#.',
  'U': '#.##.##.##.####',
  'V': '#.##.##.##.#.#.',
  'W': '#.##.########.#',
  'X': '#.##.#.#.#.##.#',
  'Y': '#.##.#.#..#..#.',
  'Z': '###..#.#.#..###',
  '0': '####.##.##.####',
  '1': '.#.##..#..#.###',
  '2': '##...#.#.#..###',
  '3': '##...#.#...###.',
  '4': '#.##.####..#..#',
  '5': '####..##...###.',
  '6': '.###..####.####',
  '7': '###..#.#..#..#.',
  '8': '####.#####.####',
  '9': '####.####..###.',
  '!': '.#..#..#.....#.',
  '-': '......###......',
  ':': '....#.....#....',
  '*': '...#.#.#.#.#...',
  '.': '.............#.',
  ',': '..........#.#..',
  "'": '.#..#..........',
  '$': '.####..#..####.',
  '?': '##...#.#.....#.',
  ' ': '...............',
}

/** Draws text in a 3x5 pixel font, 4 pixels a letter (times `scale`), clipped to [clipX0, clipX1]. */
export function text(
  cv: Canvas,
  str: string,
  x: number,
  y: number,
  color: (i: number, px: number, py: number) => RGB,
  clipX0 = 0,
  clipX1 = PW - 1,
  scale = 1,
): void {
  ;[...str.toUpperCase()].forEach((ch, i) => {
    const glyph = FONT[ch] ?? FONT['?'] ?? ''
    const bits = glyph
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) {
        if (bits[r * 3 + c] !== '#') continue
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const px = x + (i * 4 + c) * scale + sx
            const py = y + r * scale + sy
            if (px < clipX0 || px > clipX1) continue
            cv.set(px, py, color(i, px, py))
          }
      }
  })
}

export function textWidth(str: string, scale = 1): number {
  return (str.length * 4 - 1) * scale
}

const PAL: Record<string, RGB> = {
  r: [225, 35, 35],
  R: [130, 12, 12],
  g: [50, 160, 50],
  w: [255, 255, 255],
  y: [252, 214, 40],
  Y: [190, 135, 10],
  o: [245, 175, 35],
  O: [160, 95, 10],
  c: [110, 215, 250],
  C: [35, 95, 195],
}

// 9x9 symbols, '.' transparent.
// prettier-ignore
export const SPRITES: Record<string, string[]> = {
  cherry: ['......gg.', '.....g.g.', '....g..g.', '...g...g.', '.rr...rr.', 'rwrr.rwrr', 'rrrR.rrrR', 'rrRR.rrRR', '.RR...RR.'],
  lemon: ['...yyy...', '.yyyyyyy.', 'ywwyyyyyY', 'ywyyyyyyY', 'yyyyyyyyY', 'yyyyyyyYY', '.yyyyyYY.', '...YYY...', '.........'],
  bell: ['....o....', '...ooo...', '..owooo..', '..owooo..', '.owoooOo.', '.oooooOo.', 'ooooooOOo', 'OOOOOOOOO', '....O....'],
  star: ['....y....', '....y....', '...ywy...', 'yyyyyyyyy', '.yyyyyyY.', '..yyyyY..', '.yyY.yYY.', '.yY...YY.', '.........'],
  diamond: ['.........', '.ccccccc.', 'cwcwccccC', 'ccccccCCC', '.cccccCC.', '..cccCC..', '...cCC...', '....C....', '.........'],
  seven: ['rrrrrrrrR', 'rwwwwwrRR', '......rR.', '.....rR..', '....rR...', '...rrR...', '...rR....', '..rrR....', '..rR.....'],
}

export function spritePixel(name: string, x: number, y: number): RGB | undefined {
  const ch = SPRITES[name]?.[y]?.[x]
  return ch === undefined || ch === '.' ? undefined : PAL[ch]
}
