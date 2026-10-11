export interface MusicTrack {
  url: string;
  userId: string;
  title: string;
  ready: boolean;
}

// Reserve a position before looking up metadata, preserving FIFO during slow requests.
export class MusicQueue {
  readonly pending: MusicTrack[] = [];
  current: MusicTrack | null = null;
  private disposed = false;

  constructor(
    private readonly start: (track: MusicTrack) => void,
    private readonly stop: () => void,
    private readonly empty: () => void
  ) {}

  add(url: string, userId: string): MusicTrack {
    if (this.disposed) throw new Error('Музыкальная сессия закрыта.');
    const track = { url, userId, title: url, ready: false };
    this.pending.push(track);
    return track;
  }

  contains(track: MusicTrack): boolean {
    return !this.disposed && (this.current === track || this.pending.includes(track));
  }

  markReady(track: MusicTrack, title: string): boolean {
    if (!this.contains(track)) return false;
    track.title = title;
    track.ready = true;
    this.advance();
    return true;
  }

  remove(track: MusicTrack): number {
    return this.removeMatching((item) => item === track);
  }

  clearUser(userId: string): number {
    return this.removeMatching((item) => item.userId === userId);
  }

  finish(track: MusicTrack): void {
    if (this.disposed || this.current !== track) return;
    this.current = null;
    this.stop();
    this.advance();
  }

  dispose(): void {
    this.disposed = true;
    this.pending.length = 0;
    this.current = null;
    this.stop();
  }

  private removeMatching(matches: (track: MusicTrack) => boolean): number {
    let removed = 0;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (matches(this.pending[i]!)) {
        this.pending.splice(i, 1);
        removed++;
      }
    }
    if (this.current && matches(this.current)) {
      this.current = null;
      this.stop();
      removed++;
    }
    this.advance();
    return removed;
  }

  private advance(): void {
    if (this.disposed || this.current) return;
    const next = this.pending[0];
    if (!next) {
      this.empty();
    } else if (next.ready) {
      this.pending.shift();
      this.current = next;
      this.start(next);
    }
  }
}
