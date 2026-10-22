// Delay before retry number `attempt` (0-based): 1s, 2s, 4s, ... capped at maxMs, with ±20% jitter so
// that cluster workers do not retry in lockstep.
export function exponentialBackoff(attempt: number, { initialMs = 1000, maxMs = 60 * 1000 } = {}) {
  const delay = Math.min(initialMs * Math.pow(2, attempt), maxMs);
  return Math.round(delay * (0.8 + Math.random() * 0.4));
}

const DB_CONNECTION_ERROR_NAMES = [
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoTimeoutError'
];
const DB_CONNECTION_ERROR_MESSAGES = [
  /topology (is closed|was destroyed)/i,
  /not connected to the database yet/i,
  // start() rejected by stop() during shutdown: not a reason to run the shutdown once more
  /storage service stopped before connecting/i
];

// Errors that mean "the database is unreachable right now", as opposed to bugs or bad queries.
export function isDatabaseConnectionError(err: any) {
  // a rejected login can surface as a server selection error, but waiting will not fix it
  if (!err || isPermanentConnectionError(err)) {
    return false;
  }
  return (
    DB_CONNECTION_ERROR_NAMES.includes(err.name) ||
    DB_CONNECTION_ERROR_MESSAGES.some(pattern => pattern.test(String(err.message || err)))
  );
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
