jest.mock('nodemailer', () => {
  const mockSendMail = jest.fn().mockResolvedValue(undefined);

  return {
    __esModule: true,
    default: {
      createTransport: jest.fn(() => ({
        sendMail: mockSendMail,
      })),
      __mockSendMail: mockSendMail,
    },
  };
});

jest.mock('../config/env.config.js', () => ({
  config: {
    FRONT_URL: 'https://app.example.com',
    ADMIN_FRONT_URL: undefined,
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_USER: 'smtp-user',
    SMTP_PASS: 'smtp-pass',
    SMTP_FROM: 'noreply@example.com',
    SMTP_SECURE: false,
  },
}));

import { config } from '../config/env.config.js';
import { sendAdminInvitationMail } from './mail.util.js';
import nodemailer from 'nodemailer';

describe('mail.util', () => {
  const originalFrontUrl = config.FRONT_URL;
  const originalAdminFrontUrl = config.ADMIN_FRONT_URL;
  const mockedNodemailer = nodemailer as typeof nodemailer & {
    __mockSendMail: jest.Mock;
    createTransport: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    config.FRONT_URL = originalFrontUrl;
    config.ADMIN_FRONT_URL = originalAdminFrontUrl;
  });

  it('관리자 포털 URL이 있으면 초대 메일에 절대 링크를 포함해야 한다', async () => {
    await sendAdminInvitationMail({
      email: 'admin@example.com',
      invitedByName: '관리자',
    });

    expect(mockedNodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(mockedNodemailer.__mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@example.com',
        text: expect.stringContaining('https://app.example.com/admin'),
        html: expect.stringContaining('href="https://app.example.com/admin"'),
      }),
    );
  });

  it('관리자 포털 URL이 없으면 링크를 제외하고 경고를 남겨야 한다', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    config.FRONT_URL = '';
    config.ADMIN_FRONT_URL = undefined;

    await sendAdminInvitationMail({
      email: 'admin@example.com',
      invitedByName: '관리자',
    });

    expect(mockedNodemailer.__mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@example.com',
        text: expect.stringContaining(
          '현재 관리자 페이지 접속 링크가 설정되지 않았습니다.',
        ),
        html: expect.stringContaining(
          '현재 관리자 페이지 접속 링크가 설정되지 않았습니다.',
        ),
      }),
    );
    expect(mockedNodemailer.__mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.not.stringContaining('<a href='),
      }),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Admin portal URL is not configured'),
    );
  });
});
