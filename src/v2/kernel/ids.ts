import { randomUUID } from 'node:crypto';

export interface IdGenerator {
  next(): string;
}

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

export function createIdGenerator(): IdGenerator {
  return new UuidGenerator();
}
