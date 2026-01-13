/**
 * ConnectionGuard - Prevents race conditions in async connection initialization
 *
 * Solves the check-then-set anti-pattern by ensuring only one connection
 * attempt happens at a time, with all concurrent callers waiting for the same result.
 *
 * Bug #299 fix: Uses synchronous lock acquisition to prevent race between
 * checking connectPromise and creating a new one.
 */
export class ConnectionGuard {
  private connectPromise: Promise<void> | null = null;
  private _connected = false;

  /**
   * Atomically connect using the provided connection function.
   * Multiple concurrent calls will all wait for the same connection attempt.
   *
   * Bug #299 fix: Synchronously capture the promise reference before any await
   * to ensure atomicity of the check-then-set pattern.
   */
  async connect(doConnect: () => Promise<void>): Promise<void> {
    // Fast path: already connected
    if (this._connected) {
      return;
    }

    // Synchronously check and set promise reference to prevent race condition
    // This ensures only one doConnect() call is made even with concurrent callers
    if (this.connectPromise) {
      // Another connection is in progress, wait for it
      return this.connectPromise;
    }

    // Synchronously create and store the promise before any async work
    // This is the critical fix - we create the promise synchronously so
    // concurrent callers will see it immediately
    this.connectPromise = this.executeConnect(doConnect);

    return this.connectPromise;
  }

  /**
   * Execute the connection with proper cleanup
   */
  private async executeConnect(doConnect: () => Promise<void>): Promise<void> {
    try {
      await doConnect();
      this._connected = true;
    } finally {
      this.connectPromise = null;
    }
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
