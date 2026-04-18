import argon2 from 'argon2';
import COMMON_PASSWORDS from './common-passwords.js';

const MIN_PASSWORD_LENGTH = 12;

export interface PasswordValidationResult {
  valid: boolean;
  message?: string;
}

/** Validate password against length and blocklist policy. */
export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, message: 'This password is too common. Please choose a stronger one.' };
  }

  return { valid: true };
}

/** Hash a password using Argon2id with recommended defaults. */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456, // ~19 MiB
    timeCost: 2,
    parallelism: 1,
  });
}

/** Verify a password against an Argon2id hash. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
