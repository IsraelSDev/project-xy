/** Até `limit` mensagens por janela deslizante de `windowMs`, por remetente. */
export class ChatRateLimit {
  private readonly sent = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Registra a tentativa e diz se ela cabe no limite. */
  allow(sender: string, now: number): boolean {
    const recent = (this.sent.get(sender) ?? []).filter((time) => now - time < this.windowMs);
    const allowed = recent.length < this.limit;
    if (allowed) recent.push(now);
    this.sent.set(sender, recent);
    return allowed;
  }

  forget(sender: string): void {
    this.sent.delete(sender);
  }
}
