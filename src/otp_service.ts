import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.ts";
import { PaymentOtpFlow } from "./payment_otp_flow.ts";

const paymentLoginSchema = z.object({
  requestId: z.string().min(1),
  customerId: z.string().min(1),
  paymentEventId: z.string().min(1),
  phone: z.string().min(8),
  amount: z.number().nonnegative(),
  captchaToken: z.string().min(1),
  widgetRecordId: z.string().min(1),
  ip: z.string().optional(),
  locale: z.string().optional()
}).strict();

const verifySchema = paymentLoginSchema.extend({ code: z.string().min(4) }).strict();

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("INFRAI_API_KEY is required");
const flow = new PaymentOtpFlow(new InfraiClient(apiKey));

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/otp/start") {
      const input = paymentLoginSchema.parse(await readJson(request));
      const result = await flow.start(input);
      reply(response, 202, result);
      return;
    }
    if (request.method === "POST" && request.url === "/otp/verify") {
      const { code, ...input } = verifySchema.parse(await readJson(request));
      reply(response, 200, await flow.verify(input, code));
      return;
    }
    reply(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      reply(response, 400, { error: "invalid_request", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      reply(response, status, { error: error.code });
      return;
    }
    reply(response, 502, { error: "upstream_request_failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`OTP service listening on http://localhost:${port}`));
