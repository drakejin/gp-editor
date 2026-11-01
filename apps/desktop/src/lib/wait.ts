/** A real pause of `milliseconds`: what the Claude runs wait between attempts (ClaudeDeps.wait). */
export function wait(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
