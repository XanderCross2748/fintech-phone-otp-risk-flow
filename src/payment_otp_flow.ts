export type PaymentLogin = {
  requestId: string;
  customerId: string;
  paymentEventId: string;
  phone: string;
  amount: number;
  captchaToken: string;
  widgetRecordId: string;
  ip?: string;
  locale?: string;
};

export type OtpPort = {
  verifyCaptcha(input: {
    widget_record_id: string;
    token: string;
    vendor?: string;
    ip?: string;
    action?: string;
    score_threshold?: number;
  }): Promise<void>;
  sendPhoneCode(input: { phone: string; purpose: string; locale?: string }): Promise<void>;
  verifyPhone(input: { phone: string; code: string; login: boolean }): Promise<unknown>;
};

export type StartResult = { decision: "otp_sent"; requestId: string };

export type AuditNotification = {
  kind: "payment_login_verified";
  requestId: string;
  customerId: string;
  paymentEventId: string;
  occurredAt: string;
};

export class PaymentOtpFlow {
  private readonly starts = new Map<string, StartResult>();
  private readonly port: OtpPort;
  private readonly clock: () => Date;

  constructor(
    port: OtpPort,
    clock: () => Date = () => new Date()
  ) {
    this.port = port;
    this.clock = clock;
  }

  async start(input: PaymentLogin): Promise<StartResult> {
    const prior = this.starts.get(input.requestId);
    if (prior) return prior;

    await this.port.verifyCaptcha({
      widget_record_id: input.widgetRecordId,
      token: input.captchaToken,
      ip: input.ip,
      action: "payment_login",
      score_threshold: 0.75
    });
    const result: StartResult = { decision: "otp_sent", requestId: input.requestId };

    await this.port.sendPhoneCode({
      phone: input.phone,
      purpose: "payment_login",
      locale: input.locale
    });
    this.starts.set(input.requestId, result);
    return result;
  }

  async verify(input: PaymentLogin, code: string): Promise<AuditNotification> {
    await this.port.verifyPhone({ phone: input.phone, code, login: true });
    return {
      kind: "payment_login_verified",
      requestId: input.requestId,
      customerId: input.customerId,
      paymentEventId: input.paymentEventId,
      occurredAt: this.clock().toISOString()
    };
  }
}
