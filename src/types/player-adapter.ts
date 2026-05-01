/** Bridge between the danmaku engine and the host media player. */
export interface PlayerAdapter {
  /** Current playback position in seconds. Read every frame. */
  readonly position: number
  /** Whether playback is currently paused. Read every frame. */
  readonly paused: boolean
  /** Total media duration in seconds. Optional (e.g. live streams). */
  readonly duration?: number
}
