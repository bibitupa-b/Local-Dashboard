import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { join } from 'node:path'

export type SecretBox = {
  encrypt: (value: string) => string
  decrypt: (payload: string) => string
}

/** AES-256-GCM with a local key file; works in the desktop app and in CLI mode alike. */
export function createSecretBox(dataDir: string): SecretBox {
  mkdirSync(dataDir, { recursive: true })
  const keyPath = join(dataDir, 'secret.key')
  if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600 })
  const key = readFileSync(keyPath)

  return {
    encrypt(value) {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
    },
    decrypt(payload) {
      const buffer = Buffer.from(payload, 'base64')
      const iv = buffer.subarray(0, 12)
      const tag = buffer.subarray(12, 28)
      const data = buffer.subarray(28)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    },
  }
}
