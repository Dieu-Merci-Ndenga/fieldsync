/** HTTP-level failure: the server answered, so this is NOT a connectivity problem. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 4xx (except timeouts / rate limits) will fail again if repeated unchanged. */
  get permanent() {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}
