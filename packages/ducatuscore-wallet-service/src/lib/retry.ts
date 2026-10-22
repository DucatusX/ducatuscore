// Delay before retry number `attempt` (0-based): 1s, 2s, 4s, ... capped at maxMs, with ±20% jitter so
// that the DWS processes do not retry in lockstep.
export function exponentialBackoff(attempt: number, { initialMs = 1000, maxMs = 60 * 1000 } = {}) {
  const delay = Math.min(initialMs * Math.pow(2, attempt), maxMs);
  return Math.round(delay * (0.8 + Math.random() * 0.4));
}

// Errors that retrying cannot fix: a malformed connection string or rejected credentials. These should
// fail the start-up loudly instead of being retried forever.
export function isPermanentConnectionError(err: any) {
  if (!err) {
    return false;
  }
  return (
    err.name === 'MongoParseError' ||
    err.code === 18 ||
    err.codeName === 'AuthenticationFailed' ||
    /authentication failed/i.test(String(err.message || ''))
  );
}
