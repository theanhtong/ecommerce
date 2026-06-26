import { Inject, Injectable } from '@nestjs/common';

import {
  type IMailProvider,
  MAIL_PROVIDER,
} from './interfaces/mail-provider.interface.js';
import { verifyEmailTemplate } from './templates/verify-email.template.js';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_PROVIDER) private readonly provider: IMailProvider,
  ) {}

  async sendVerificationEmail(
    to: string,
    name: string,
    token: string,
  ): Promise<void> {
    const verifyUrl = `${process.env.APP_URL}/auth/verify-email?token=${token}`;

    await this.provider.send({
      to,
      subject: 'Xác thực email của bạn',
      html: verifyEmailTemplate(name, verifyUrl),
    });
  }
}
