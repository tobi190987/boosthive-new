/**
 * PROJ-29: AES-256-GCM encryption for customer credentials vault.
 * 
 * Reuses the same encryption pattern as GSC tokens but with a separate key
 * for customer credentials. Uses node:crypto (built-in).
 * CUSTOMER_CREDENTIALS_ENCRYPTION_KEY must be a 32-byte hex key (64 hex chars).
 * 
 * Format: iv:authTag:ciphertext (all hex-encoded)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32

let cachedKey: Buffer | null = null

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey

  const secret = process.env.CUSTOMER_CREDENTIALS_ENCRYPTION_KEY
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error(
      'CUSTOMER_CREDENTIALS_ENCRYPTION_KEY muss als 64-stelliger Hex-String gesetzt sein.'
    )
  }

  cachedKey = Buffer.from(secret, 'hex')
  if (cachedKey.length !== KEY_LENGTH) {
    throw new Error('CUSTOMER_CREDENTIALS_ENCRYPTION_KEY muss genau 32 Byte lang sein.')
  }

  return cachedKey
}

/**
 * Encrypts a credentials JSON object.
 * Returns a string in format: iv:authTag:ciphertext (hex-encoded).
 */
export function encryptCredentials(credentials: Record<string, any>): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const plaintext = JSON.stringify(credentials)

  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypts credentials string previously encrypted with encryptCredentials().
 * Returns the original JSON object.
 */
export function decryptCredentials(encryptedStr: string): Record<string, any> {
  const key = getEncryptionKey()
  const parts = encryptedStr.split(':')

  if (parts.length !== 3) {
    throw new Error('Ungültiges Credentials-Format.')
  }

  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const ciphertext = Buffer.from(parts[2], 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(decrypted.toString('utf8'))
}

export function isCredentialsDecryptError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('unable to authenticate data') ||
    message.includes('unsupported state') ||
    message.includes('ungültiges credentials-format')
  )
}
