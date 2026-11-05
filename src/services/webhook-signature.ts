import { createHmac, timingSafeEqual } from "node:crypto";

// compute header that GH uses to send result after signing every webhook with SHA256 over the RAW bytes of the body
export function verifySignature(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header || !header.startsWith("sha256=")) return false;

  const expected = Buffer.from(
    "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex"),
    "utf8"
  );
  const received = Buffer.from(header, "utf8");

  // timingSafeEqual throws if length differ 
  return expected.length === received.length && timingSafeEqual(expected, received);
}