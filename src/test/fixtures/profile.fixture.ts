import { fakerKO as faker } from '@faker-js/faker';
import { mockUsers } from './user.fixture.js';
import { AssistantStatus } from '../../constants/auth.constant.js';

const instructorProfileId = faker.string.uuid();

/** Profile Mock 데이터 */
export const mockProfiles = {
  instructor: {
    id: instructorProfileId,
    userId: mockUsers.instructor.id,
    phoneNumber: faker.phone.number({ style: 'national' }),
    subject: faker.helpers.arrayElement([
      '국어',
      '영어',
      '수학',
      '과학',
      '사회',
    ]),
    academy: `${faker.company.name()} 학원`,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    deletedAt: null,
  },
  assistant: {
    id: faker.string.uuid(),
    userId: mockUsers.assistant.id,
    phoneNumber: faker.phone.number({ style: 'national' }),
    instructorId: instructorProfileId,
    signupCode: faker.string.alphanumeric(10).toUpperCase(),
    contract: null,
    signStatus: AssistantStatus.SIGNED,
    name: faker.person.fullName(),
    memo: null,
    deletedAt: null,
    attendanceStatus: 'PENDING',
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  },
  student: {
    id: faker.string.uuid(),
    userId: mockUsers.student.id,
    phoneNumber: faker.phone.number({ style: 'national' }),
    school: `${faker.person.lastName()}고등학교`,
    schoolYear: faker.helpers.arrayElement(['1', '2', '3']),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  },
  parent: {
    id: faker.string.uuid(),
    userId: mockUsers.parent.id,
    phoneNumber: faker.phone.number({ style: 'national' }),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  },
} as const;
