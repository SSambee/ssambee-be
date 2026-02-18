import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/env.config.js';

let transporter: Transporter | null = null;

const hasRequiredMailConfig = () => {
  return !!(
    config.SMTP_HOST &&
    config.SMTP_PORT &&
    config.SMTP_FROM &&
    config.SMTP_USER &&
    config.SMTP_PASS
  );
};

const getTransporter = () => {
  if (!hasRequiredMailConfig()) {
    throw new Error(
      'SMTP 설정이 누락되었습니다. SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM 값을 확인하세요.',
    );
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE ?? false,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
    });
  }

  return transporter;
};

const sendAuthMail = async ({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => {
  const mailTransporter = getTransporter();

  await mailTransporter.sendMail({
    from: config.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });
};

export const sendEmailOtp = async ({
  email,
  otp,
  type,
}: {
  email: string;
  otp: string;
  type: 'sign-in' | 'email-verification' | 'forget-password';
}) => {
  const titleByType = {
    'sign-in': '이메일 인증 코드',
    'email-verification': '이메일 인증 코드',
    'forget-password': '비밀번호 재설정 코드',
  } as const;

  const subject = `[EduOps] ${titleByType[type]}`;
  const text = `${titleByType[type]}: ${otp}`;
  const html = `<div>
    <p>${titleByType[type]}입니다.</p>
    <p style="font-size: 24px; font-weight: 700; letter-spacing: 2px;">${otp}</p>
    <p>유효시간 내에 입력해주세요.</p>
  </div>`;

  await sendAuthMail({
    to: email,
    subject,
    text,
    html,
  });
};

export const sendVerificationLinkMail = async ({
  email,
  url,
}: {
  email: string;
  url: string;
}) => {
  await sendAuthMail({
    to: email,
    subject: '[EduOps] 이메일 인증 링크',
    text: `아래 링크로 이메일 인증을 완료해주세요: ${url}`,
    html: `<div>
      <p>아래 버튼을 눌러 이메일 인증을 완료해주세요.</p>
      <a href="${url}" target="_blank" rel="noreferrer noopener">이메일 인증하기</a>
    </div>`,
  });
};

export const sendPasswordResetLinkMail = async ({
  email,
  url,
}: {
  email: string;
  url: string;
}) => {
  await sendAuthMail({
    to: email,
    subject: '[EduOps] 비밀번호 재설정',
    text: `아래 링크에서 비밀번호를 재설정해주세요: ${url}`,
    html: `<div>
      <p>아래 버튼을 눌러 비밀번호를 재설정해주세요.</p>
      <a href="${url}" target="_blank" rel="noreferrer noopener">비밀번호 재설정</a>
    </div>`,
  });
};
