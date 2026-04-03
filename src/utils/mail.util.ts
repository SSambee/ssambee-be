import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/env.config.js';
import { getAdminPortalBaseUrl } from './origin.util.js';

let transporter: Transporter | null = null;
const ADMIN_PORTAL_UNAVAILABLE_NOTICE =
  '현재 관리자 페이지 접속 링크가 설정되지 않았습니다. 운영팀에 문의해주세요.';

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

const getAdminPortalUrl = (): string | null => {
  const adminFrontUrl = getAdminPortalBaseUrl({
    frontUrl: config.FRONT_URL,
    adminFrontUrl: config.ADMIN_FRONT_URL,
  });

  if (!adminFrontUrl) {
    return null;
  }

  try {
    return new URL('/admin', adminFrontUrl).toString();
  } catch (_error) {
    return null;
  }
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

  const subject = `[SSAMBEE] ${titleByType[type]}`;
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
    subject: '[SSAMBEE] 이메일 인증 링크',
    text: `아래 링크로 이메일 인증을 완료해주세요: ${url}`,
    html: `<div>
      <p>아래 버튼을 눌러 이메일 인증을 완료해주세요.</p>
      <a href="${url}" target="_blank" rel="noreferrer noopener">이메일 인증하기</a>
    </div>`,
  });
};

export const sendAdminInvitationMail = async ({
  email,
  invitedByName,
}: {
  email: string;
  invitedByName: string;
}) => {
  const adminPortalUrl = getAdminPortalUrl();
  const hasAdminPortalUrl = Boolean(adminPortalUrl);

  if (!hasAdminPortalUrl) {
    console.warn(
      '[sendAdminInvitationMail] Admin portal URL is not configured. Set FRONT_URL or ADMIN_FRONT_URL to include the portal link in invitation emails.',
    );
  }

  await sendAuthMail({
    to: email,
    subject: '[SSAMBEE] 관리자 초대 안내',
    text: hasAdminPortalUrl
      ? `${invitedByName}님이 관리자 계정으로 초대했습니다. 관리자 페이지에 접속해 이메일 OTP 인증 후 비밀번호를 설정해주세요: ${adminPortalUrl}`
      : `${invitedByName}님이 관리자 계정으로 초대했습니다. 관리자 페이지에 접속해 이메일 OTP 인증 후 비밀번호를 설정해주세요. ${ADMIN_PORTAL_UNAVAILABLE_NOTICE}`,
    html: hasAdminPortalUrl
      ? `<div>
      <p>${invitedByName}님이 관리자 계정으로 초대했습니다.</p>
      <p>아래 링크로 이동해 이메일 OTP 인증을 완료하고 비밀번호를 설정해주세요.</p>
      <a href="${adminPortalUrl}" target="_blank" rel="noreferrer noopener">관리자 페이지로 이동</a>
    </div>`
      : `<div>
      <p>${invitedByName}님이 관리자 계정으로 초대했습니다.</p>
      <p>관리자 페이지에 접속해 이메일 OTP 인증을 완료하고 비밀번호를 설정해주세요.</p>
      <p>${ADMIN_PORTAL_UNAVAILABLE_NOTICE}</p>
    </div>`,
  });
};
