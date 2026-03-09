import type {
  StudentPost,
  InstructorPost,
} from '../generated/prisma/client.js';
import type { Subjects as PrismaSubjects } from '@casl/prisma';

export type AppSubjects =
  | PrismaSubjects<{
      StudentPost: StudentPost;
      InstructorPost: InstructorPost;
    }>
  | 'all';
