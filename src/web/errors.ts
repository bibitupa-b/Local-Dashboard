const BILLING = /402|insufficient balance/i
const AUTH = /401|invalid_grant|unauthorized|invalid credentials/i
const FORBIDDEN = /403|insufficient permission|scope/i
const MAIL_LOGIN = /authenticationfailed|invalid login|login failed|auth.*failed/i
// The page only ever fetches its own server: a failed fetch means that server died, not the internet.
const SERVER_GONE = /failed to fetch|load failed/i
const NETWORK = /enotfound|eai_again|fetch failed|etimedout|network|socket hang up/i
const RATE = /429|rate limit|too many requests/i
const SERVER = /\s5\d\d$/
const STALE = /\s404$/

/** Turns provider and network errors into one line a non-technical user can act on. */
export function friendlyError(message: string): string {
  if (BILLING.test(message)) {
    return 'DeepSeek: the balance is empty. Top up at platform.deepseek.com, then try again.'
  }
  if (RATE.test(message)) return 'Too many requests. Wait a minute and try again.'
  if (SERVER.test(message)) {
    return 'The local server hit an error. Restart Local Dashboard, then try again.'
  }
  if (STALE.test(message)) {
    return 'The local server does not know this request. Reinstall Local Dashboard so the app and the server match.'
  }
  if (MAIL_LOGIN.test(message)) {
    return 'Mail sign-in failed. Check the Gmail app password in Settings.'
  }
  if (AUTH.test(message)) return 'Access expired or was revoked. Reconnect the account in Settings.'
  if (FORBIDDEN.test(message)) {
    return 'Access denied. Reconnect the account and grant the requested permissions.'
  }
  if (SERVER_GONE.test(message)) {
    return 'The local server stopped answering. Restart Local Dashboard, then try again.'
  }
  if (NETWORK.test(message)) return 'No network connection. Check your internet and try again.'
  return message
}
