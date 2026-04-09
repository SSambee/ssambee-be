import { fakerKO as faker } from '@faker-js/faker';
import { UserType } from '../../constants/auth.constant.js';
import type { User } from '../../generated/prisma/client.js';

/** Mock User 데이터 */
export const mockUsers: {
  admin: User;
  instructor: User;
  assistant: User;
  student: User;
  parent: User;
} = {
  admin: {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    emailVerified: true,
    name: faker.person.fullName(),
    image: null,
    userType: UserType.ADMIN,
    role: 'admin',
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  },
  instructor: {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    emailVerified: false,
    name: faker.person.fullName(),
    image: null,
    userType: UserType.INSTRUCTOR,
    role: null,
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  },
  assistant: {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    emailVerified: false,
    name: faker.person.fullName(),
    image: null,
    userType: UserType.ASSISTANT,
    role: null,
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  },
  student: {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    emailVerified: false,
    name: faker.person.fullName(),
    image: null,
    userType: UserType.STUDENT,
    role: null,
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  },
  parent: {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    emailVerified: false,
    name: faker.person.fullName(),
    image: null,
    userType: UserType.PARENT,
    role: null,
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  },
};
