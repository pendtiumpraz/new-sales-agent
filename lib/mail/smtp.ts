import nodemailer from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

function transporter(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

/** Authenticate to the SMTP server without sending anything (connect + AUTH). */
export async function verifySmtp(cfg: SmtpConfig): Promise<void> {
  await transporter(cfg).verify();
}

export async function sendViaSmtp(
  cfg: SmtpConfig,
  msg: { from: string; to: string; subject: string; text: string },
): Promise<string> {
  const info = await transporter(cfg).sendMail(msg);
  return info.messageId;
}
