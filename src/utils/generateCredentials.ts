import { randomInt } from "crypto";

/** Generates a random numeric string of the given length (e.g. "482913"). */
export function generateNumericCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += randomInt(0, 10).toString();
  return code;
}
