import crypto from "crypto";

export function generateId(len) {
  const id = crypto.randomBytes(16).toString("hex");
  return id;
}
