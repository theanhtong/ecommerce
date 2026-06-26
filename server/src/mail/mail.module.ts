import { Global, Module } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { GmailMailProvider } from './providers/gmail.provider.js';
import { MAIL_PROVIDER } from './interfaces/mail-provider.interface.js';
import { MailService } from './mail.service.js';
import { MockMailProvider } from './providers/mock.provider.js';
import { ResendMailProvider } from './providers/resend.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: MAIL_PROVIDER,
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('MAIL_PROVIDER');
        console.log('MAIL_PROVIDER:', provider);
        switch (provider) {
          case 'resend':
            return new ResendMailProvider();
          case 'gmail':
            return new GmailMailProvider();
          default:
            return new MockMailProvider();
        }
      },
      inject: [ConfigService],
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
