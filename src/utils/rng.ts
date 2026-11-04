import { randomInt } from "crypto";

/** Cryptographically secure random integer in [0, maxExclusive). */
export function secureRandomInt(maxExclusive: number): number {
  return randomInt(maxExclusive);
}
