/** Text to show for something thrown or rejected: an Error's message, else `fallback`, else the value as text. */
export function errorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback ?? String(error);
}
