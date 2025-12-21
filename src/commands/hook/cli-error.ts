export class HookCliError extends Error {
  readonly exitCode: number;

  constructor(exitCode: number, message: string) {
    super(message);
    this.exitCode = exitCode;
  }
}

