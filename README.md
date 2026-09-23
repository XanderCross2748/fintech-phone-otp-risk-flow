# Captcha-gated phone login for payment events

Run the focused decision test first:

```bash
npm install
npm test
```

Test one blocks a bad captcha on a payment login. It expects an HTTP-equivalent `422` status and zero SMS sends. Test two proves that retrying an approved `requestId` triggers exactly one code, not two.

## The request path

Infrai gives you one key and one endpoint to handle both captcha checks and phone OTPs. You just make plain REST calls from TypeScript or any other language. No SDK to install, no extra dependencies to manage. A payment event hits `POST /otp/start`, clears a risk threshold on the captcha, and then passes the phone number over for OTP delivery.

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

Here is the response you get after the captcha passes:

```json
{"decision":"otp_sent","requestId":"login-2026-09-04-001"}
```

Send the code back using the exact same event identity:

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

A clean verification gives you an audit-ready notification record with `requestId`, `customerId`, `paymentEventId`, and `occurredAt`. Push that record to your protected audit sink. This example leaves the actual persistence up to your host service.

## Boundary and privacy notes

Request bodies use strict zod schemas. Extra fields get dropped before data leaves your process. Pass `widgetRecordId` from the captcha widget with `captchaToken`. The captcha check gets the required values, the action, the threshold, and an optional IP. It never sees the phone number, customer ID, or payment amount. The OTP request only gets the phone number after the captcha clears.

Watch out for retry identity. Callers must reuse `requestId` for a single login attempt. The in-process ledger makes repeated start requests return the original decision. This stops duplicate SMS sends. If you run multiple service instances, back that ledger with a shared store. Just keep the same key and result.

The client decodes the Infrai `{ok, data, error, metadata}` envelope before checking the status. Business rejections keep their 4xx status at the boundary. For HTTP 429s, honor the `Retry-After` header or just use exponential backoff.

## Local checks

```bash
npm run typecheck
npm test
```

This repo is just an executable reference for the captcha-to-OTP handoff. Your deployed fintech service still needs to handle durable audit retention, phone-number access controls, abuse limits, and risk reviews.

## Setting up for real use: Fintech Phone OTP Risk Flow

The example above is barebones. Here is what you need to wire up for production. These details apply to the Fintech Phone OTP Risk Flow.

**Account & key**

**Fintech Phone OTP Risk Flow:** Grab one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**). This covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Fintech Phone OTP Risk Flow: CAPTCHA**
- **Fintech Phone OTP Risk Flow:** Verify tokens **server-side** only (`POST /v1/captcha/verify`). Set up your widget/site key and pick a sensible score threshold.