export type GamePhase = 'idle' | 'spinning' | 'stopping' | 'won' | 'lost'

export type Game = {
  phase: GamePhase
  /** Where the reels end up once stopped. */
  isWin: boolean
  /** The main-loop turn the reels ride on. */
  turnId: string | null
  /** Frame the lever pull started on. */
  pullStart: number
  /** Frame at which the reels begin to stop, one by one. */
  stopFrame: number
  /** Strip index each reel lands on (payline). */
  final: number[]
  tokens: number
  input: number
  output: number
  cache: number
  durationMs: number
  headline: string
  quote: string
  tags: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'gamble-mode': { game: Game; frame: number; bankroll: number; isEnabled: boolean }
  }
}
