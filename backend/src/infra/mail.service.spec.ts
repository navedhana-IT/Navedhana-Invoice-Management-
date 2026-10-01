process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET = 'test-jwt-secret-min-32-chars-long-123456';
process.env.SMTP_HOST = 'smtp.hostinger.com';
process.env.SMTP_PORT = '465';
process.env.SMTP_SECURE = 'true';
process.env.SMTP_USER = 'contact@navedhana.com';
process.env.SMTP_PASS = 'Navedhana*12';
process.env.SMTP_FROM = 'contact@navedhana.com';

import { Test, TestingModule } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';
import { StorageService } from './storage.service';

jest.mock('nodemailer');

describe('MailService', () => {
  let service: MailService;
  let mockStorage: { get: jest.Mock };
  let mockTransporter: { sendMail: jest.Mock; verify: jest.Mock };

  beforeEach(async () => {
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-msg-123' }),
      verify: jest.fn().mockResolvedValue(true),
    };
    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);

    mockStorage = {
      get: jest.fn().mockResolvedValue(Buffer.from('dummy file data')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('formats sender address with brand display name', () => {
    expect(service.fromAddress).toContain('contact@navedhana.com');
    expect(service.fromAddress).toContain('nbills');
  });

  it('delivers mail through transporter with rendered HTML and attachments', async () => {
    await service.deliver({
      template: 'password-reset',
      to: 'user@example.com',
      data: { name: 'Alice', url: 'https://example.com/reset', minutes: 60 },
      attachments: [{ storageKey: 'invoices/1.pdf', filename: 'invoice.pdf' }],
    });

    expect(mockStorage.get).toHaveBeenCalledWith('invoices/1.pdf');
    expect(mockTransporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Reset your nbills password',
        attachments: [
          {
            filename: 'invoice.pdf',
            content: Buffer.from('dummy file data'),
          },
        ],
      }),
    );
  });

  it('verifies SMTP connection successfully', async () => {
    const verified = await service.verifyConnection();
    expect(verified).toBe(true);
    expect(mockTransporter.verify).toHaveBeenCalled();
  });
});
