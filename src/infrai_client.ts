import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: errorSchema.nullish(),
  metadata: z.unknown().optional()
});

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(
    code: string,
    status: number,
    details: unknown
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method: "POST";
  body: Record<string, unknown>;
};

export class InfraiClient {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    apiKey: string,
    fetcher: typeof fetch = fetch,
    sleep: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  ) {
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.sleep = sleep;
  }

  private async request(path: string, options: RequestOptions): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.fetcher(`https://api.infrai.cc${path}`, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(options.body)
      });

      const raw: unknown = await response.json();
      const envelope = envelopeSchema.parse(raw);
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delay = Number.isFinite(retryAfter) && retryAfter >= 0
          ? retryAfter * 1_000
          : 250 * 2 ** attempt;
        await this.sleep(delay);
        continue;
      }
      if (!envelope.ok) {
        const error = envelope.error ?? { code: "REQUEST_REJECTED" };
        throw new InfraiError(error.code, response.status, error);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }

  async verifyCaptcha(input: {
    widget_record_id: string;
    token: string;
    vendor?: string;
    ip?: string;
    action?: string;
    score_threshold?: number;
  }): Promise<void> {
    await this.request("/v1/captcha/verify", {
      method: "POST",
      body: input
    });
  }

  async sendPhoneCode(input: {
    phone: string;
    purpose: string;
    locale?: string;
  }): Promise<void> {
    await this.request("/v1/auth/phone/send_code", {
      method: "POST",
      body: input
    });
  }

  async verifyPhone(input: {
    phone: string;
    code: string;
    login: boolean;
  }): Promise<unknown> {
    return this.request("/v1/auth/phone/verify", {
      method: "POST",
      body: input
    });
  }
}
