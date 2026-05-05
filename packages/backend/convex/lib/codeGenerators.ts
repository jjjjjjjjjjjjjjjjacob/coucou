/**
 * Shared code generation utilities
 * Consolidated from duplicate implementations in approvals.ts and redemptions.ts
 */

/**
 * Generates a random code from a given alphabet
 * @param length - Length of the code to generate
 * @param alphabet - Character set to use for generation
 * @returns Random code string
 */
function generateRandomCode(length: number, alphabet: string): string {
  let result = "";
  for (let iteration = 0; iteration < length; iteration++) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

/**
 * Generates a URL-safe fallback code for approvals
 * 22 characters using letters, numbers, hyphens, and underscores
 * @returns 22-character URL-safe approval code
 */
export function generateApprovalCode(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return generateRandomCode(22, alphabet);
}

/**
 * Generates an 8-character uppercase redemption code
 * Uses only uppercase letters and numbers for easy manual entry
 * @returns 8-character uppercase redemption code
 */
export function generateRedemptionCode(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return generateRandomCode(8, alphabet);
}
