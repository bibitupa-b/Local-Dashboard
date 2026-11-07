'use strict'

/**
 * Auto-update is opt-in: it never runs in local-only mode, and the person can turn it off.
 * Pure on purpose so the truth table is testable without Electron.
 */
function shouldCheckForUpdates(localOnly, autoUpdate) {
  return !localOnly && autoUpdate
}

module.exports = { shouldCheckForUpdates }
