import type { StrengthLevel } from './controls'

// Mirrors the server's password rule (signup and reset-password schemas): 8–128 characters
// with a lowercase letter, an uppercase letter, a digit and one of !@#$%^&*.
export const meetsPasswordPolicy = (p: string) =>
  p.length >= 8 && p.length <= 128 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[!@#$%^&*]/.test(p)

/** Weak = doesn't meet the rule; Medium = meets it; Strong = meets it with 12+ characters. */
export function getPasswordStrength(password: string): StrengthLevel {
  if (!meetsPasswordPolicy(password)) return 1
  return password.length >= 12 ? 3 : 2
}

export const PASSWORD_RULE = 'At least 8 characters, with upper and lower case letters, a number and one of ! @ # $ % ^ & *'
export const PASSWORD_ERROR = 'Use at least 8 characters, with upper and lower case letters, a number and one of ! @ # $ % ^ & *'
export const MISMATCH_ERROR = "This doesn't match the password above"
