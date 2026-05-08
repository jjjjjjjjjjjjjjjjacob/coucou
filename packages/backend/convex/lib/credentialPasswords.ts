export function normalizeCredentialPassword(password: string): string {
  return password.trim().toLowerCase();
}

export function passwordMatchesCredential(
  candidatePassword: string,
  storedPassword: string | undefined,
): boolean {
  if (!storedPassword) return false;
  return (
    normalizeCredentialPassword(candidatePassword) === normalizeCredentialPassword(storedPassword)
  );
}
