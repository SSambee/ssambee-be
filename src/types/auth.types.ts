export interface SignUpData {
  email: string;
  password: string;
  name?: string;
  phoneNumber: string;
  subject?: string;
  academy?: string;
  signupCode?: string;
  school?: string;
  schoolYear?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  userType: string;
  [key: string]: unknown;
}

export interface AuthSession {
  id: string;
  token?: string;
  expiresAt: Date;
  [key: string]: unknown;
}

export interface AuthResponse {
  user: AuthUser;
  session?: AuthSession | { token: string } | null;
  token?: string;
  profile?: unknown;
  setCookie?: string | string[] | null; // For passing cookies from Better Auth handler
}

export interface ProfileBase {
  id: string;
  userId: string | null;
  phoneNumber: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt?: Date | null;
  [key: string]: unknown;
}

export interface ProfileAssistant extends ProfileBase {
  name?: string;
  signStatus: string;
  [key: string]: unknown;
}
