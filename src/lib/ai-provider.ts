export type ChatTurn = { role: "user" | "assistant"; content: string };

export interface AIProvider {
  reply(history: ChatTurn[]): Promise<string>;
}

export class OpenAIProvider implements AIProvider {
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly model = process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async reply(history: ChatTurn[]): Promise<string> {
    if (!this.apiKey) throw new Error("AI provider is not configured");

    const response = await this.fetcher("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are Cheetah, the friendly customer support assistant for Cheetah Broadband, a UK internet provider. Give clear, concise help about broadband, Wi-Fi, billing, outages and account support. Never claim to access or change a customer's account. Do not request passwords, full card numbers, or security codes. For account-specific or unresolved issues, offer escalation to a human support specialist.",
          },
          ...history,
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`AI provider returned ${response.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new Error("AI provider returned an empty response");
    return answer;
  }

  async checkConnection(): Promise<boolean> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not configured");
    const response = await this.fetcher("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`AI provider connection failed (${response.status})`);
    return true;
  }
}
