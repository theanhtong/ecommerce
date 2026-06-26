import {
  IMailProvider,
  MailPayload,
} from '../interfaces/mail-provider.interface.js';

import { Injectable } from '@nestjs/common';

@Injectable()
export class ResendMailProvider implements IMailProvider {
  async send(payload: MailPayload): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      }),
    });
    if (!res.ok) throw new Error(`Resend error: ${res.statusText}`);
  }
}
