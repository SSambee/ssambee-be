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
    BANK_TRANSFER_ACCOUNT_BANK: '국민은행',
    BANK_TRANSFER_ACCOUNT_NUMBER: '123-456-7890',
    BANK_TRANSFER_ACCOUNT_HOLDER: '주식회사 쌤비',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_USER: 'smtp-user',
    SMTP_PASS: 'smtp-pass',
    SMTP_FROM: 'noreply@example.com',
    SMTP_SECURE: false,
  },
}));

import { config } from '../config/env.config.js';
import {
  sendAdminInvitationMail,
  sendBankTransferApprovedMail,
  sendBankTransferDepositRequestMail,
  sendBankTransferRejectedMail,
} from './mail.util.js';
import nodemailer from 'nodemailer';

describe('mail.util', () => {
  const originalFrontUrl = config.FRONT_URL;
  const originalAdminFrontUrl = config.ADMIN_FRONT_URL;
  const originalBankName = config.BANK_TRANSFER_ACCOUNT_BANK;
  const originalAccountNumber = config.BANK_TRANSFER_ACCOUNT_NUMBER;
  const originalAccountHolder = config.BANK_TRANSFER_ACCOUNT_HOLDER;
  const mockedNodemailer = nodemailer as typeof nodemailer & {
    __mockSendMail: jest.Mock;
    createTransport: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    config.FRONT_URL = originalFrontUrl;
    config.ADMIN_FRONT_URL = originalAdminFrontUrl;
    config.BANK_TRANSFER_ACCOUNT_BANK = originalBankName;
    config.BANK_TRANSFER_ACCOUNT_NUMBER = originalAccountNumber;
    config.BANK_TRANSFER_ACCOUNT_HOLDER = originalAccountHolder;
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('입금 요청 메일에 계좌 정보와 결제 요약을 포함해야 한다', async () => {
    await sendBankTransferDepositRequestMail({
      email: 'instructor@example.com',
      productName: '3개월 이용권',
      totalAmount: 297000,
      depositorName: '홍길동',
      depositorBankName: '신한은행',
    });

    expect(mockedNodemailer.__mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'instructor@example.com',
        text: expect.stringContaining('은행: 국민은행'),
        html: expect.stringContaining('계좌번호: 123-456-7890'),
      }),
    );
    expect(mockedNodemailer.__mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('상품: 3개월 이용권'),
        html: expect.stringContaining('입금자명: 홍길동'),
      }),
    );
  });

  it('승인 메일에 FRONT_URL 루트 링크를 포함해야 한다', async () => {
    await sendBankTransferApprovedMail({
      email: 'instructor@example.com',
      productName: '1개월 이용권',
      totalAmount: 99000,
    });

    expect(mockedNodemailer.__mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'instructor@example.com',
        text: expect.stringContaining('https://app.example.com/'),
        html: expect.stringContaining('href="https://app.example.com/"'),
      }),
    );
  });

  it('반려 메일에 반려 사유를 포함해야 한다', async () => {
    await sendBankTransferRejectedMail({
      email: 'instructor@example.com',
      productName: '충전권',
      totalAmount: 55000,
      reason: '입금자명이 일치하지 않습니다.',
    });

    expect(mockedNodemailer.__mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'instructor@example.com',
        text: expect.stringContaining(
          '반려 사유: 입금자명이 일치하지 않습니다.',
        ),
        html: expect.stringContaining('입금자명이 일치하지 않습니다.'),
      }),
    );
  });

  it('FRONT_URL이 없으면 무통장 메일에서 링크를 제외해야 한다', async () => {
    config.FRONT_URL = '';

    await sendBankTransferApprovedMail({
      email: 'instructor@example.com',
      productName: '1개월 이용권',
      totalAmount: 99000,
    });

    expect(mockedNodemailer.__mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining(
          '현재 서비스 접속 링크가 설정되지 않았습니다.',
        ),
        html: expect.not.stringContaining('<a href='),
      }),
    );
  });
});
