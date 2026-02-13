import { fakerKO as faker } from '@faker-js/faker';
import { UserType } from '../../constants/auth.constant.js';

/** Mock User 데이터 */
export const mockUsers = {
  instructor: {
    id: faker.string.uuid(),
    email: faker.internet.email(),
    emailVerified: false,
    name: faker.person.fullName(),
    image: null,
    userType: UserType.INSTRUCTOR,
    banned: false,
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
    banned: false,
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
    banned: false,
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
    banned: false,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  },
} as const;
