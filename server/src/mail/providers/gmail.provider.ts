import * as nodemailer from 'nodemailer';

import {
  IMailProvider,
  MailPayload,
} from '../interfaces/mail-provider.interface.js';

import { Injectable } from '@nestjs/common';

@Injectable()
export class GmailMailProvider implements IMailProvider {
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  async send(payload: MailPayload): Promise<void> {
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
  }
}
