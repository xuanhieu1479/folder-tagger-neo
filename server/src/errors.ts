import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** An error whose message is meant for the user; the status goes back to the browser. */
export class HttpError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
  }
}
