import nodemailer from "nodemailer";

import { accessTokenFromRefresh, providerSmtp, type MailProvider } from "./oauth";

// SMTP app-password mailbox (the original connect path).
export interface SmtpPasswordConfig {
  kind?: "smtp";
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

// OAuth mailbox (doc 32) — Gmail / MS 365 via SMTP XOAUTH2. We persist only the
// refresh token; the access token is minted per send.
export interface OAuthMailConfig {
  kind: "oauth";
  provider: MailProvider;
  user: string;
  refreshToken: string;
}

export type MailConfig = SmtpPasswordConfig | OAuthMailConfig;
// Back-compat alias — existing callers import `SmtpConfig`.
export type SmtpConfig = MailConfig;

async function buildTransport(cfg: MailConfig) {
  if (cfg.kind === "oauth") {
    const accessToken = await accessTokenFromRefresh(cfg.provider, cfg.refreshToken);
    const smtp = providerSmtp(cfg.provider);
    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: !smtp.secure, // STARTTLS for office365:587
      auth: { type: "OAuth2", user: cfg.user, accessToken },
    });
  }
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

/** Authenticate to the server without sending anything (connect + AUTH). */
export async function verifySmtp(cfg: MailConfig): Promise<void> {
  await (await buildTransport(cfg)).verify();
}

export async function sendViaSmtp(
  cfg: MailConfig,
  msg: { from: string; to: string; subject: string; text: string },
): Promise<string> {
  const info = await (await buildTransport(cfg)).sendMail(msg);
  return info.messageId;
}
