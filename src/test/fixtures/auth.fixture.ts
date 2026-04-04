import { fakerKO as faker } from '@faker-js/faker';
import { UserType } from '../../constants/auth.constant.js';
import { mockUsers } from './user.fixture.js';

const assistantSignupCode = faker.string.alphanumeric(10).toUpperCase();

/** Mock Session 데이터 */
export const mockSession = {
  id: faker.string.uuid(),
  userId: mockUsers.instructor.id,
  token: faker.string.alphanumeric(32),
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ipAddress: faker.internet.ip(),
  userAgent: faker.internet.userAgent(),
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
} as const;

/** 회원가입 요청 데이터 */
export const signUpRequests = {
  instructor: {
    email: faker.internet.email(),
    password: 'password123!',
    name: faker.person.fullName(),
    phoneNumber: faker.phone.number({ style: 'national' }),
    subject: faker.helpers.arrayElement(['국어', '영어', '수학']),
    academy: `${faker.company.name()} 학원`,
  },
  assistant: {
    email: faker.internet.email(),
    password: 'password123!',
    name: faker.person.fullName(),
    phoneNumber: faker.phone.number({ style: 'national' }),
    signupCode: assistantSignupCode,
  },
  student: {
    email: faker.internet.email(),
    password: 'password123!',
    name: faker.person.fullName(),
    phoneNumber: faker.phone.number({ style: 'national' }),
    parentPhoneNumber: faker.phone.number({ style: 'national' }),
    school: `${faker.person.lastName()}고등학교`,
    schoolYear: faker.helpers.arrayElement(['1', '2', '3']),
  },
  parent: {
    email: faker.internet.email(),
    password: 'password123!',
    userType: UserType.PARENT,
    name: faker.person.fullName(),
    phoneNumber: faker.phone.number({ style: 'national' }),
  },
} as const;

/** 로그인 요청 데이터 */
export const signInRequests = {
  admin: {
    email: mockUsers.admin.email,
    password: 'password123!',
    rememberMe: false,
  },
  instructor: {
    email: mockUsers.instructor.email,
    password: 'password123!',
    userType: UserType.INSTRUCTOR,
    rememberMe: false,
  },
  student: {
    email: mockUsers.student.email,
    password: 'password123!',
    userType: UserType.STUDENT,
    rememberMe: true,
  },
} as const;

/** 조교 코드 Mock 데이터 */
export const mockAssistantCode = {
  id: faker.string.uuid(),
  code: assistantSignupCode,
  instructorId: mockUsers.instructor.id,
  isUsed: false,
  expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30일 후
  createdAt: faker.date.recent(),
} as const;
