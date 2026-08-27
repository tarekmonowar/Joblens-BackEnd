import { readFileSync } from "fs";
import { join } from "path";
import Handlebars from "handlebars";
import nodemailer, { Transporter } from "nodemailer";
import { envVars } from "../../config/env";

export interface IAlertEmailJob {
  title: string;
  company: string;
  location: string;
  sourceUrl: string;
}

class EmailService {
  private transport: Transporter;
  private templates = new Map<string, Handlebars.TemplateDelegate>();

  constructor() {
    this.transport = nodemailer.createTransport({
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      secure: envVars.SMTP_SECURE,
      auth: { user: envVars.SMTP_USER, pass: envVars.SMTP_PASS },
    });

    const names = [
      "verify-email",
      "reset-password",
      "alert-instant",
      "alert-daily",
      "alert-weekly",
    ];
    for (const name of names) {
      const filePath = join(
        process.cwd(),
        "src/app/modules/email/templates",
        `${name}.hbs`,
      );
      this.templates.set(name, Handlebars.compile(readFileSync(filePath, "utf-8")));
    }
  }

  private async send(
    to: string,
    subject: string,
    templateName: string,
    context: Record<string, unknown>,
  ) {
    const template = this.templates.get(templateName);
    if (!template) {
      console.error(`Missing email template: ${templateName}`);
      return;
    }
    try {
      await this.transport.sendMail({
        from: envVars.MAIL_FROM,
        to,
        subject,
        html: template({ ...context, appName: envVars.APP_NAME }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Email failed [${templateName}] to=${to}: ${message}`);
    }
  }

  async sendVerifyEmail(to: string, link: string) {
    await this.send(to, `Verify your ${envVars.APP_NAME} account`, "verify-email", {
      link,
    });
  }

  async sendResetPassword(to: string, link: string) {
    await this.send(to, `Reset your ${envVars.APP_NAME} password`, "reset-password", {
      link,
    });
  }

  async sendInstantAlert(
    to: string,
    jobs: IAlertEmailJob[],
    alert: { keywords: string[]; skills: string[] },
  ) {
    await this.send(to, `${jobs.length} new job(s) match your alert`, "alert-instant", {
      jobs,
      alert,
      manageUrl: `${envVars.FRONTEND_ORIGIN}/alerts`,
    });
  }

  async sendDailyDigest(to: string, jobs: IAlertEmailJob[]) {
    await this.send(to, `Your daily job digest (${jobs.length})`, "alert-daily", {
      jobs,
      manageUrl: `${envVars.FRONTEND_ORIGIN}/alerts`,
    });
  }

  async sendWeeklyDigest(to: string, jobs: IAlertEmailJob[]) {
    await this.send(to, `Your weekly job digest (${jobs.length})`, "alert-weekly", {
      jobs,
      manageUrl: `${envVars.FRONTEND_ORIGIN}/alerts`,
    });
  }
}

export const EmailServices = new EmailService();
