/** Defines safe, exposed HTTP failures for the loopback editor. */
import type { JsonRecord as SharedJsonRecord } from "../platform/serialization/json-guards.js";

export type JsonRecord = SharedJsonRecord;

export class HttpError extends Error {
  readonly status: number;
  readonly expose: boolean;

  constructor(status: number, message: string, expose = status < 500) {
    super(message);
    this.status = status;
    this.expose = expose;
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}
