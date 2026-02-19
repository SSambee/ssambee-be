import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { UserType, AssistantStatus } from '../src/constants/auth.constant.js';
import { EnrollmentStatus } from '../src/constants/enrollments.constant.js';
import { LectureStatus } from '../src/constants/lectures.constant.js';
import { QuestionType } from '../src/constants/exams.constant.js';
import { MaterialType } from '../src/constants/materials.constant.js';
import {
  PostScope,
  TargetRole,
  AuthorRole,
  StudentPostStatus,
} from '../src/constants/posts.constant.js';
import { v7 as uuidv7 } from 'uuid';
import { createId } from '@paralleldrive/cuid2';
import { hashPassword } from 'better-auth/crypto';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seeding...');

  const now = new Date();
  const hashedPassword = await hashPassword('qwer1234');

  // 0. Clean up existing data (Ordered by dependency)
  await prisma.comment.deleteMany();
  await prisma.studentPost.deleteMany();
  await prisma.instructorPostTarget.deleteMany();
  await prisma.instructorPostAttachment.deleteMany();
  await prisma.instructorPost.deleteMany();
  await prisma.material.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.studentAnswer.deleteMany();
  await prisma.question.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.lectureTime.deleteMany();
  await prisma.lectureEnrollment.deleteMany();
  await prisma.lecture.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.parentChildLink.deleteMany();
  await prisma.assistant.deleteMany();
  await prisma.instructor.deleteMany();
  await prisma.appParent.deleteMany();
  await prisma.appStudent.deleteMany();
  await prisma.account.deleteMany(); // better-auth accounts
  await prisma.session.deleteMany(); // better-auth sessions
  await prisma.user.deleteMany();

  console.log('🧹 Database cleaned up.');

  // 1. Identity Layer: Users & Profiles
  console.log('👤 Creating users and profiles...');

  // --- Apidog Fixed Users ---

  // 1-1. Instructor (나카무라 유키토)
  const instructorUser = await prisma.user.create({
    data: {
      id: uuidv7(),
      email: 'mgmt@test.com',
      name: '나카무라 유키토',
      userType: UserType.INSTRUCTOR,
      role: 'instructor',
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.account.create({
    data: {
      id: uuidv7(),
      userId: instructorUser.id,
      accountId: instructorUser.email,
      providerId: 'credential',
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    },
  });

  const instructor = await prisma.instructor.create({
    data: {
      id: uuidv7(),
      userId: instructorUser.id,
      phoneNumber: '010-1234-5678',
      subject: '영어',
      academy: '의정부 어학원',
      createdAt: now,
      updatedAt: now,
    },
  });

  // 1-2. Assistant (후지모토)
  const assistantUser = await prisma.user.create({
    data: {
      id: uuidv7(),
      email: 'mgmtas@test.com',
      name: '후지모토',
      userType: UserType.ASSISTANT,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.account.create({
    data: {
      id: uuidv7(),
      userId: assistantUser.id,
      accountId: assistantUser.email,
      providerId: 'credential',
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.assistant.create({
    data: {
      id: uuidv7(),
      userId: assistantUser.id,
      instructorId: instructor.id,
      name: '후지모토',
      phoneNumber: '010-2345-6789',
      signStatus: AssistantStatus.SIGNED,
      signupCode: 'TDtGUe',
      createdAt: now,
      updatedAt: now,
    },
  });

  // 1-3. Student (정길동)
  const studentUser = await prisma.user.create({
    data: {
      id: uuidv7(),
      email: 'svc@test.com',
      name: '정길동',
      userType: UserType.STUDENT,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.account.create({
    data: {
      id: uuidv7(),
      userId: studentUser.id,
      accountId: studentUser.email,
      providerId: 'credential',
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    },
  });

  const studentProfile = await prisma.appStudent.create({
    data: {
      id: uuidv7(),
      userId: studentUser.id,
      phoneNumber: '010-234-5678',
      school: '의정부고',
      schoolYear: '고1',
      createdAt: now,
      updatedAt: now,
    },
  });

  // 1-4. Parent (정국영)
  const parentUser = await prisma.user.create({
    data: {
      id: uuidv7(),
      email: 'paren@test.com',
      name: '정국영',
      userType: UserType.PARENT,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.account.create({
    data: {
      id: uuidv7(),
      userId: parentUser.id,
      accountId: parentUser.email,
      providerId: 'credential',
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    },
  });

  const parentProfile = await prisma.appParent.create({
    data: {
      id: uuidv7(),
      userId: parentUser.id,
      phoneNumber: '010-223-5432',
      createdAt: now,
      updatedAt: now,
    },
  });

  // 2. Relationship Layer: Enrollments & Parent-Child Links
  console.log('🔗 Creating links and enrollments...');

  // Parent-Child Link (정길동 - 정국영)
  const childLink = await prisma.parentChildLink.create({
    data: {
      id: uuidv7(),
      appParentId: parentProfile.id,
      name: '정길동',
      phoneNumber: '010-234-5678',
      createdAt: now,
      updatedAt: now,
    },
  });

  // Enrollment for English Lecture
  const apidogEnrollmentsData = [
    {
      school: '의정부고',
      schoolYear: '고1',
      studentName: '정길동',
      studentPhone: '010-234-5678',
      parentPhone: '010-223-5432',
    },
    {
      school: '의정부고',
      schoolYear: '고1',
      studentName: '김강지',
      studentPhone: '010-234-6789',
      parentPhone: '010-4523-1122',
    },
    {
      school: '의정부고',
      schoolYear: '고1',
      studentName: '홍모네',
      studentPhone: '010-2455-8824',
      parentPhone: '010-3322-8824',
    },
  ];

  const enrollments = [];
  for (const data of apidogEnrollmentsData) {
    const enrollment = await prisma.enrollment.create({
      data: {
        id: createId(),
        instructorId: instructor.id,
        appStudentId:
          data.studentPhone === '010-234-5678' ? studentProfile.id : null,
        appParentLinkId:
          data.studentPhone === '010-234-5678' ? childLink.id : null,
        studentName: data.studentName,
        studentPhone: data.studentPhone,
        parentPhone: data.parentPhone,
        school: data.school,
        schoolYear: data.schoolYear,
        status: EnrollmentStatus.ACTIVE,
      },
    });
    enrollments.push(enrollment);
  }

  // 3. Academic Structure: Lectures
  console.log('📚 Creating lectures...');

  const englishLecture = await prisma.lecture.create({
    data: {
      id: createId(),
      instructorId: instructor.id,
      title: '의정부고 고등영어 1학년　내신반',
      subject: '영어',
      schoolYear: '고1',
      description: '의정부고 고1 대상 내신 대비 과정입니다.',
      status: LectureStatus.IN_PROGRESS,
      startAt: new Date('2026-01-28T10:00:00.000Z'),
      endAt: new Date('2026-03-22T10:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
    },
  });

  // Lecture Times
  await prisma.lectureTime.createMany({
    data: [
      {
        id: createId(),
        lectureId: englishLecture.id,
        instructorId: instructor.id,
        day: 'MON',
        startTime: '12:00',
        endTime: '16:00',
      },
      {
        id: createId(),
        lectureId: englishLecture.id,
        instructorId: instructor.id,
        day: 'TUE',
        startTime: '16:00',
        endTime: '18:00',
      },
      {
        id: createId(),
        lectureId: englishLecture.id,
        instructorId: instructor.id,
        day: 'THU',
        startTime: '13:00',
        endTime: '15:00',
      },
    ],
  });

  // Lecture Enrollments
  for (const enrollment of enrollments) {
    await prisma.lectureEnrollment.create({
      data: {
        id: createId(),
        lectureId: englishLecture.id,
        enrollmentId: enrollment.id,
      },
    });
  }

  // 4. Activity Layer: Exams, Materials, Posts (Optional extras for smoke test)
  console.log('📝 Creating basic activities...');

  const exam = await prisma.exam.create({
    data: {
      id: createId(),
      lectureId: englishLecture.id,
      instructorId: instructor.id,
      title: '중간고사 대비 영어 단어 테스트',
      cutoffScore: 80,
      examDate: new Date('2026-03-10'),
      gradingStatus: 'COMPLETED',
      isAutoClinic: true,
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.question.create({
    data: {
      id: createId(),
      examId: exam.id,
      lectureId: englishLecture.id,
      questionNumber: 1,
      content: 'apple의 뜻은?',
      score: 10,
      type: QuestionType.MULTIPLE,
      correctAnswer: '1',
      choices: { 1: '사과', 2: '배' },
    },
  });

  await prisma.material.create({
    data: {
      id: createId(),
      instructorId: instructor.id,
      lectureId: englishLecture.id,
      title: '고1 필수 영단어 100선',
      filename: 'vocab_100.pdf',
      fileUrl: 'https://example.com/vocab.pdf',
      type: MaterialType.OTHER,
      authorName: '나카무라 유키토',
      authorRole: 'INSTRUCTOR',
      createdAt: now,
      updatedAt: now,
    },
  });

  // --- 자료실 자료 추가 (다양한 타입) ---
  // 1. PAPER (EXAM_PAPER)
  await prisma.material.create({
    data: {
      id: createId(),
      instructorId: instructor.id,
      lectureId: englishLecture.id,
      title: '2025학년도 3월 모의고사 기출문제',
      filename: 'mock_exam_2025_03.pdf',
      fileUrl: 'https://example.com/mock_exam.pdf',
      type: MaterialType.PAPER,
      authorName: '나카무라 유키토',
      authorRole: 'INSTRUCTOR',
      createdAt: now,
      updatedAt: now,
    },
  });

  // 2. VIDEO (VIDEO_LINK)
  await prisma.material.create({
    data: {
      id: createId(),
      instructorId: instructor.id,
      lectureId: englishLecture.id,
      title: '고1 필수 영문법 - 관계대명사 편',
      filename: 'grammar_video_link',
      fileUrl: 'https://www.youtube.com/watch?v=example',
      type: MaterialType.VIDEO,
      authorName: '나카무라 유키토',
      authorRole: 'INSTRUCTOR',
      createdAt: now,
      updatedAt: now,
    },
  });

  // 3. REQUEST (INSTRUCTOR_REQUEST)
  await prisma.material.create({
    data: {
      id: createId(),
      instructorId: instructor.id,
      lectureId: englishLecture.id,
      title: '[조교요청] 교재 오탈자 수정 건',
      filename: 'typo_fix_request.docx',
      fileUrl: 'https://example.com/request.docx',
      type: MaterialType.REQUEST,
      authorName: '나카무라 유키토',
      authorRole: 'INSTRUCTOR',
      createdAt: now,
      updatedAt: now,
    },
  });

  // --- 추가: 강사 공지 및 학생 질문 ---
  // 1. 강사 공지 (Notice)
  await prisma.instructorPost.create({
    data: {
      id: createId(),
      instructorId: instructor.id,
      lectureId: englishLecture.id,
      title: '[공지] 중간고사 대비 보강 안내',
      content:
        '3월 15일 일요일 오후 2시에 중간고사 대비 보강이 있을 예정입니다. 모두 참석해 주세요.',
      scope: PostScope.LECTURE,
      targetRole: TargetRole.ALL,
      isImportant: true,
      authorRole: 'INSTRUCTOR',
      createdAt: now,
      updatedAt: now,
    },
  });

  // 2. 강사 자료 공유 (SHARE - isImportant: false)
  await prisma.instructorPost.create({
    data: {
      id: createId(),
      instructorId: instructor.id,
      lectureId: englishLecture.id,
      title: '[자료] 수능 감 잡기 - 원본 텍스트 및 분석본',
      content:
        '학습에 활용할 수 있는 수능 감 잡기 원본 텍스트와 분석본입니다. 다운로드하여 확인하세요.',
      scope: PostScope.LECTURE,
      targetRole: TargetRole.ALL,
      isImportant: false, // isImportant: false 필터링 시 SHARE로 간주됨
      authorRole: 'INSTRUCTOR',
      createdAt: now,
      updatedAt: now,
    },
  });

  // 3. 학생 질문 (정길동 학생의 질문)
  const studentEnrollment = enrollments.find((e) => e.studentName === '정길동');
  if (studentEnrollment) {
    await prisma.studentPost.create({
      data: {
        id: createId(),
        instructorId: instructor.id,
        lectureId: englishLecture.id,
        enrollmentId: studentEnrollment.id,
        title: '이번 수업 과제 질문입니다.',
        content:
          '선생님, 지난 수업 때 내주신 과제에서 3번 문항의 의도가 잘 이해되지 않습니다. 설명 부탁드려요!',
        status: StudentPostStatus.BEFORE,
        authorRole: AuthorRole.STUDENT,
        createdAt: now,
        updatedAt: now,
      },
    });

    // 4. 학부모 질문 (정국영 학부모가 정길동 학생 관련으로 올린 질문)
    await prisma.studentPost.create({
      data: {
        id: createId(),
        instructorId: instructor.id,
        lectureId: englishLecture.id,
        enrollmentId: studentEnrollment.id,
        title: '자녀 학습 태도 관련 문의드립니다.',
        content:
          '선생님, 안녕하세요. 정길동 학생의 아빠 정국영입니다. 요즘 저희 아이가 수업을 잘 따라가고 있는지 궁금하여 연락드렸습니다.',
        status: StudentPostStatus.BEFORE,
        authorRole: AuthorRole.PARENT, // AuthorRole.PARENT (학부모 작성)
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
