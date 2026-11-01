const BILLING = /402|insufficient balance/i
const AUTH = /401|invalid_grant|unauthorized|invalid credentials/i
const FORBIDDEN = /403|insufficient permission|scope/i
const MAIL_LOGIN = /authenticationfailed|invalid login|login failed|auth.*failed/i
const NETWORK = /enotfound|eai_again|fetch failed|etimedout|network|socket hang up/i
const RATE = /429|rate limit|too many requests/i

/** Turns provider and network errors into one line a non-technical user can act on. */
export function friendlyError(message: string): string {
  if (BILLING.test(message)) {
    return 'DeepSeek: the balance is empty. Top up at platform.deepseek.com, then try again.'
  }
  if (RATE.test(message)) return 'Too many requests. Wait a minute and try again.'
  if (MAIL_LOGIN.test(message)) {
    return 'Mail sign-in failed. Check the Gmail app password in Settings.'
  }
  if (AUTH.test(message)) return 'Access expired or was revoked. Reconnect the account in Settings.'
  if (FORBIDDEN.test(message)) {
    return 'Access denied. Reconnect the account and grant the requested permissions.'
  }
  if (NETWORK.test(message)) return 'No network connection. Check your internet and try again.'
  return message
}
