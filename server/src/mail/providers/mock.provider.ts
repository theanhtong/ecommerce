import {
  IMailProvider,
  MailPayload,
} from '../interfaces/mail-provider.interface.js';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MockMailProvider implements IMailProvider {
  private readonly logger = new Logger(MockMailProvider.name);

  async send(payload: MailPayload): Promise<void> {
    this.logger.log('─────────────────────────────────');
    this.logger.log(`TO: ${payload.to}`);
    this.logger.log(`SUBJECT: ${payload.subject}`);
    this.logger.log(`BODY: ${payload.html}`);
    this.logger.log('─────────────────────────────────');
  }
}
