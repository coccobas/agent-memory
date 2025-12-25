/**
 * ConnectionGuard - Prevents race conditions in async connection initialization
 *
 * Solves the check-then-set anti-pattern by ensuring only one connection
 * attempt happens at a time, with all concurrent callers waiting for the same result.
 */
export class ConnectionGuard {
  private connectPromise: Promise<void> | null = null;
  private _connected = false;

  /**
   * Atomically connect using the provided connection function.
   * Multiple concurrent calls will all wait for the same connection attempt.
   */
  async connect(doConnect: () => Promise<void>): Promise<void> {
    // Fast path: already connected
    if (this._connected) {
      return;
    }

    // If connection is in progress, wait for it
    if (this.connectPromise) {
      return this.connectPromise;
    }

    // Start new connection attempt
    this.connectPromise = doConnect()
      .then(() => {
        this._connected = true;
      })
      .finally(() => {
        this.connectPromise = null;
      });

    return this.connectPromise;
  }

  get connected(): boolean {
    return this._connected;
  }

  setDisconnected(): void {
    this._connected = false;
  }

  reset(): void {
    this._connected = false;
    this.connectPromise = null;
  }
}
