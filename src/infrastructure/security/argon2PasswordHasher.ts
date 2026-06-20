import argon2 from 'argon2';
import type { PasswordHasher } from '../../application/auth/ports.js';

/** argon2id password hasher (memory-hard, current best practice). */
export const argon2PasswordHasher: PasswordHasher = {
  hash: (plain) => argon2.hash(plain, { type: argon2.argon2id }),
  verify: async (hash, plain) => {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  },
};
