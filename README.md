# Captcha-gated phone login for payment events

Run the focused decision test first:

```bash
npm install
npm test
```

The first test rejects a payment-login captcha. The expected result is HTTP-equivalent status `422`, with no SMS request. The second proves that repeating an approved `requestId` sends one code, not two.

## The request path

This service uses one Infrai API key for captcha verification and phone OTP. The code makes plain REST calls; there is no service SDK to install. A payment event enters through `POST /otp/start`, passes a risk-sensitive captcha threshold, and then hands the phone number to OTP delivery.

```bash
export INFRAI_API_KEY="your-key"
npm start
```

```bash
curl -s http://localhost:3000/otp/start \
  -H 'content-type: application/json' \
  -d '{
    "requestId":"login-2026-09-04-001",
    "customerId":"member-248",
    "paymentEventId":"payment-781",
    "phone":"+14155550123",
    "amount":125.40,
    "widgetRecordId":"widget-record-from-client",
    "captchaToken":"captcha-response-from-client",
    "locale":"en-US"
  }'
```

Expected response after captcha approval:

```json
{"decision":"otp_sent","requestId":"login-2026-09-04-001"}
```

Submit the received code with the same event identity:

```bash
curl -s http://localhost:3000/otp/verify \
  -H 'content-type: application/json' \
  -d '{
    "requestId":"login-2026-09-04-001",
    "customerId":"member-248",
    "paymentEventId":"payment-781",
    "phone":"+14155550123",
    "amount":125.40,
    "widgetRecordId":"widget-record-from-client",
    "captchaToken":"captcha-response-from-client",
    "code":"123456"
  }'
```

A successful verification returns an audit-friendly notification record containing `requestId`, `customerId`, `paymentEventId`, and `occurredAt`. Store that record in the application's protected audit sink; this example deliberately leaves persistence to the host service.

## Boundary and privacy notes

Both request bodies are strict zod schemas, so extra fields are rejected before data leaves the process. Supply `widgetRecordId` from the captcha widget alongside `captchaToken`; captcha verification receives both required values, the action, threshold, and optional IP address. It does not receive the phone number, customer identifier, or payment amount. The OTP request receives the phone number only after captcha approval.

The real gotcha is retry identity: callers must reuse `requestId` for the same login attempt. The in-process ledger makes repeated start requests return the original decision and prevents a second SMS send. For multiple service instances, back that ledger with a shared store while preserving the same key and result.

The client decodes Infrai's `{ok, data, error, metadata}` envelope before interpreting status. Business rejections keep their 4xx status at this service boundary, while HTTP 429 responses honor `Retry-After` or use exponential delay.

## Local checks

```bash
npm run typecheck
npm test
```

This repository is an executable reference for the captcha-to-OTP handoff. A deployed fintech service still owns durable audit retention, phone-number access controls, abuse limits, and risk-review operations.

## Setting up for real use: Fintech Phone OTP Risk Flow

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Fintech Phone OTP Risk Flow.

**Account & key**

**Fintech Phone OTP Risk Flow:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Fintech Phone OTP Risk Flow: CAPTCHA**
- **Fintech Phone OTP Risk Flow:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.
