import assert from "node:assert/strict";
import test from "node:test";
import { InfraiError } from "../src/infrai_client.ts";
import { PaymentOtpFlow, type OtpPort } from "../src/payment_otp_flow.ts";

test("a rejected captcha prevents an OTP send", async () => {
  let sendCount = 0;
  const port: OtpPort = {
    verifyCaptcha: async () => {
      throw new InfraiError("captcha_check_rejected", 422, {});
    },
    sendPhoneCode: async () => { sendCount += 1; },
    verifyPhone: async () => ({})
  };
  const flow = new PaymentOtpFlow(port);

  const result = flow.start({
    requestId: "req-401",
    customerId: "patient-billing-17",
    paymentEventId: "payment-88",
    phone: "+14155550123",
    amount: 4800,
    widgetRecordId: "widget-401",
    captchaToken: "captcha-check-401"
  });

  await assert.rejects(result, (error: unknown) =>
    error instanceof InfraiError && error.status === 422
  );
  assert.equal(sendCount, 0);
});

test("repeating a captcha-approved request does not send a second OTP", async () => {
  let sendCount = 0;
  let widgetRecordId: string | undefined;
  const port: OtpPort = {
    verifyCaptcha: async (input) => { widgetRecordId = input.widget_record_id; },
    sendPhoneCode: async () => { sendCount += 1; },
    verifyPhone: async () => ({})
  };
  const flow = new PaymentOtpFlow(port);
  const input = {
    requestId: "req-402",
    customerId: "patient-billing-18",
    paymentEventId: "payment-89",
    phone: "+14155550124",
    amount: 42,
    widgetRecordId: "widget-402",
    captchaToken: "captcha-check-402"
  };

  assert.equal((await flow.start(input)).decision, "otp_sent");
  assert.equal((await flow.start(input)).decision, "otp_sent");
  assert.equal(sendCount, 1);
  assert.equal(widgetRecordId, input.widgetRecordId);
});
