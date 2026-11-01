export function vaultName(vaultPath: string): string {
  return vaultPath.split(/[\\/]/).filter(Boolean).pop() ?? 'Main Obsidian Vault'
}

export function obsidianUrl(vaultPath: string, notePath?: string): string {
  const vault = encodeURIComponent(vaultName(vaultPath))
  if (!notePath) return `obsidian://open?vault=${vault}`
  return `obsidian://open?vault=${vault}&file=${encodeURIComponent(notePath.replace(/\.md$/i, ''))}`
}

export function mailUrl(messageId: string | null, subject: string): string {
  const query = messageId ? `rfc822msgid:${messageId}` : subject
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`
}

export function driveUrl(id: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`
}

export function sourceUrl(id: string, vaultPath: string): string | null {
  switch (id) {
    case 'vault':
      return obsidianUrl(vaultPath)
    case 'drive':
    case 'google':
      return 'https://drive.google.com'
    case 'mail':
    case 'imap':
      return 'https://mail.google.com'
    case 'calendar':
      return 'https://calendar.google.com'
    case 'github':
      return 'https://github.com/notifications'
    default:
      return null
  }
}
