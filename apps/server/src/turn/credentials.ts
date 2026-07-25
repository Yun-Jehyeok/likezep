import crypto from "crypto";

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
}

export function generateTurnCredentials(
  host: string,
  port: number,
  secret: string,
  ttlSeconds: number
): TurnCredentials {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expires}:poc-user`;
  const credential = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");

  return {
    urls: [`turn:${host}:${port}`, `turn:${host}:${port}?transport=tcp`],
    username,
    credential,
  };
}
