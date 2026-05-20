import bcrypt from "bcryptjs";

export function hashPassword(plain: string, rounds = 10): Promise<string> {
  return bcrypt.hash(plain, rounds);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A valid bcrypt hash for the string "dummy_password" (cost 10)
const DUMMY_BCRYPT_HASH = "$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa";

/**
 * Executes a dummy bcrypt comparison to mitigate timing attacks.
 * Call this when a user is not found so the request takes the same amount of time.
 */
export function compareDummyPassword(plain: string): Promise<boolean> {
  return bcrypt.compare(plain, DUMMY_BCRYPT_HASH);
}
