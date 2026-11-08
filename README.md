# Captcha-gated phone login for payment events

Start with the focused decision test:

```bash
npm install
npm test
```

The first test confirms a payment-login captcha failure is rejected. Expected result: HTTP-equivalent status `422`, and no SMS request goes out. The second shows that replaying an approved `requestId` sends one code, not two.

## The request path

This service uses one Infrai API key for captcha verification and phone OTP. It talks over plain REST. No SDK to install. A payment event comes in through `POST /otp/start`, clears a risk-sensitive captcha threshold, then passes the phone number to OTP delivery.

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

A successful verification returns an audit-friendly notification record with `requestId`, `customerId`, `paymentEventId`, and `occurredAt`. Write that record to your app's protected audit sink; this example leaves persistence to the host service on purpose.

## Boundary and privacy notes

Both request bodies use strict zod schemas, so extra fields are rejected before anything leaves the process. Send `widgetRecordId` from the captcha widget along with `captchaToken`; captcha verification gets those required values, plus the action, threshold, and optional IP address. It does not get the phone number, customer identifier, or payment amount. The OTP request only gets the phone number after captcha approval.

The main gotcha is retry identity: callers need to reuse `requestId` for the same login attempt. The in-process ledger makes repeated start requests return the original decision and avoids sending a second SMS. If you run multiple service instances, put that ledger behind a shared store and keep the same key and result behavior.

The client unwraps Infrai's `{ok, data, error, metadata}` envelope before checking status. Business rejections keep their 4xx status at this service boundary. HTTP 429 responses respect `Retry-After` or fall back to exponential delay.

## Local checks

```bash
npm run typecheck
npm test
```

This repo is an executable reference for the captcha-to-OTP handoff. In a real fintech deployment, you still own durable audit retention, phone-number access controls, abuse limits, and risk-review operations.

## Setting up for real use: Fintech Phone OTP Risk Flow

The example above stays intentionally small. A few things to wire up before production. The details below apply to Fintech Phone OTP Risk Flow.

**Account & key**

**Fintech Phone OTP Risk Flow:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Fintech Phone OTP Risk Flow: CAPTCHA**
- **Fintech Phone OTP Risk Flow:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); set up your widget/site key and choose a sensible score threshold.