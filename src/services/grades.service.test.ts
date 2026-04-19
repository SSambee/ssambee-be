import { UserType } from '../constants/auth.constant.js';
import { GradingStatus } from '../constants/exams.constant.js';
import {
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import { GradesService } from './grades.service.js';
import {
  createMockGradesRepository,
  createMockExamsRepository,
  createMockLecturesRepository,
  createMockLectureEnrollmentsRepository,
  createMockAttendancesRepository,
} from '../test/mocks/repo.mock.js';
import {
  createMockPermissionService,
  createMockFileStorageService,
} from '../test/mocks/services.mock.js';
import { createMockPrisma } from '../test/mocks/prisma.mock.js';
import {
  mockLectures,
  mockInstructor,
  mockExams,
  mockQuestions,
  mockGrades,
  submitGradingRequests,
} from '../test/fixtures/index.js';
import type { GradesRepository } from '../repos/grades.repo.js';
import type { ExamsRepository } from '../repos/exams.repo.js';
import type { LecturesRepository } from '../repos/lectures.repo.js';
import type { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import type { AttendancesRepository } from '../repos/attendances.repo.js';
import type { PermissionService } from './permission.service.js';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';

describe('GradesService - @unit #critical', () => {
  let gradesService: GradesService;
  let mockGradesRepo: jest.Mocked<GradesRepository>;
  let mockExamsRepo: jest.Mocked<ExamsRepository>;
  let mockLecturesRepo: jest.Mocked<LecturesRepository>;

  let mockLectureEnrollmentsRepo: jest.Mocked<LectureEnrollmentsRepository>;
  let mockAttendancesRepo: jest.Mocked<AttendancesRepository>;
  let mockPermissionService: jest.Mocked<PermissionService>;
  let mockFileStorageService: ReturnType<typeof createMockFileStorageService>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  const mockUserType = UserType.INSTRUCTOR;
  const mockProfileId = mockInstructor.id;
  const mockLecture = mockLectures.basic;
  const mockExam = mockExams.basic;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGradesRepo = createMockGradesRepository();
    mockExamsRepo = createMockExamsRepository();
    mockLecturesRepo = createMockLecturesRepository();

    mockLectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    mockAttendancesRepo = createMockAttendancesRepository();
    mockPermissionService = createMockPermissionService();
    mockFileStorageService = createMockFileStorageService();
    mockPrisma = createMockPrisma() as unknown as jest.Mocked<PrismaClient>;

    mockPrisma.$transaction.mockImplementation(
      <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
        callback(mockPrisma as unknown as Prisma.TransactionClient),
    );

    gradesService = new GradesService(
      mockGradesRepo,
      mockExamsRepo,
      mockLecturesRepo,
      mockLectureEnrollmentsRepo,
      mockAttendancesRepo,
      mockPermissionService,
      mockFileStorageService,
      mockPrisma,
    );
  });

  describe('[채점] submitGrading', () => {
    it('강사가 올바른 정보로 채점 결과를 제출할 때, 점수 계산이 정확하면 제출이 성공하고 성적 정보가 반환된다', async () => {
      // 준비
      const data = submitGradingRequests.basic;
      const mockQuestionsList = [
        mockQuestions.multipleChoice,
        mockQuestions.shortAnswer,
      ];

      mockExamsRepo.findById.mockResolvedValue(
        mockExam as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockLecturesRepo.findById.mockResolvedValue(
        mockLecture as Awaited<ReturnType<typeof mockLecturesRepo.findById>>,
      );
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue(mockQuestionsList);
      mockGradesRepo.upsertGrade.mockResolvedValue(mockGrades.basic);

      // 실행
      const result = await gradesService.submitGrading(
        mockExam.id,
        data,
        mockUserType,
        mockProfileId,
      );

      // 검증
      expect(mockExamsRepo.findById).toHaveBeenCalledWith(mockExam.id);
      expect(mockLecturesRepo.findById).toHaveBeenCalledWith(
        mockExam.lectureId,
      );
      expect(mockPermissionService.validateInstructorAccess).toHaveBeenCalled();
      expect(mockGradesRepo.upsertStudentAnswers).toHaveBeenCalled();
      expect(mockGradesRepo.upsertGrade).toHaveBeenCalledWith(
        mockExam.lectureId,
        mockExam.id,
        data.lectureEnrollmentId,
        data.totalScore,
        data.totalScore >= mockExam.cutoffScore,
        mockPrisma,
      );
      expect(result).toBeDefined();
    });

    it('서술형 문항이 포함된 경우, 서버 자동 채점 없이 클라이언트의 판정을 신뢰하여 제출된다', async () => {
      const data = submitGradingRequests.withEssay;
      const mockQuestionsList = [mockQuestions.essay];

      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-essay',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue(mockQuestionsList);

      await gradesService.submitGrading(
        mockExam.id,
        data,
        mockUserType,
        mockProfileId,
      );

      expect(mockGradesRepo.upsertGrade).toHaveBeenCalledWith(
        mockExam.lectureId,
        mockExam.id,
        data.lectureEnrollmentId,
        data.totalScore,
        data.totalScore >= mockExam.cutoffScore,
        mockPrisma,
      );
    });

    it('이미 채점이 완료된 시험에 제출을 시도할 때에도 제출이 성공한다', async () => {
      const completedExam = {
        ...mockExam,
        gradingStatus: GradingStatus.COMPLETED,
      } as Awaited<ReturnType<typeof mockExamsRepo.findById>>;
      const data = submitGradingRequests.basic;
      const mockQuestionsList = [
        mockQuestions.multipleChoice,
        mockQuestions.shortAnswer,
      ];

      mockExamsRepo.findById.mockResolvedValue(completedExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue(mockQuestionsList);
      mockGradesRepo.upsertGrade.mockResolvedValue(mockGrades.basic);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).resolves.toBeDefined();
    });

    it('객관식 문항의 정답이 서버 데이터와 일치하지 않을 때, BadRequestException을 던진다', async () => {
      const data = {
        ...submitGradingRequests.basic,
        answers: [
          {
            questionId: mockQuestions.multipleChoice.id,
            submittedAnswer: 'B', // 실제 정답은 'A'
            isCorrect: true, // 클라이언트는 정답이라고 주장
          },
        ],
      };
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([
        mockQuestions.multipleChoice,
      ]);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('클라이언트가 계산한 총점이 서버에서 계산한 총점과 다를 때, BadRequestException을 던진다', async () => {
      const data = { ...submitGradingRequests.basic, totalScore: 999 }; // 잘못된 총점
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([
        mockQuestions.multipleChoice,
        mockQuestions.shortAnswer,
      ]);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('중복된 문항 ID가 제출될 때, BadRequestException을 던진다', async () => {
      const data = {
        ...submitGradingRequests.basic,
        answers: [
          submitGradingRequests.basic.answers[0],
          submitGradingRequests.basic.answers[0], // 중복
        ],
      };
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([
        mockQuestions.multipleChoice,
        mockQuestions.shortAnswer,
      ]);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow('문항 1번의 답안이 중복 제출되었습니다.');
    });

    it('유효하지 않은 문항 ID가 제출될 때, BadRequestException을 던진다', async () => {
      const data = {
        ...submitGradingRequests.basic,
        answers: [
          {
            ...submitGradingRequests.basic.answers[0],
            questionId: 'invalid-q-id',
          },
        ],
      };
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([
        mockQuestions.multipleChoice,
      ]);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow('해당 시험에 존재하지 않는 문항입니다.');
    });

    it('클라이언트가 제출한 정답 개수가 서버 계산과 다를 때, BadRequestException을 던진다', async () => {
      const data = { ...submitGradingRequests.basic, correctCount: 999 }; // 잘못된 개수
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([
        mockQuestions.multipleChoice,
        mockQuestions.shortAnswer,
      ]);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow('정답 개수가 올바르지 않습니다');
    });

    it('수강 정보의 강의 ID와 시험의 강의 ID가 일치하지 않을 때, BadRequestException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: 'other-lecture',
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          submitGradingRequests.basic,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('[조회] getGradesByExam', () => {
    it('권한이 있는 사용자가 성적 조회를 요청할 때, 해당 시험의 성적 목록이 반환된다', async () => {
      const mockGradesList = [mockGrades.withEnrollment] as unknown as Awaited<
        ReturnType<typeof mockGradesRepo.findGradesByExamId>
      >;
      mockExamsRepo.findById.mockResolvedValue(
        mockExam as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockLecturesRepo.findById.mockResolvedValue(
        mockLecture as Awaited<ReturnType<typeof mockLecturesRepo.findById>>,
      );
      mockGradesRepo.findGradesByExamId.mockResolvedValue(mockGradesList);

      const result = await gradesService.getGradesByExam(
        mockExam.id,
        mockUserType,
        mockProfileId,
      );

      expect(mockGradesRepo.findGradesByExamId).toHaveBeenCalledWith(
        mockExam.id,
      );
      expect(result).toEqual(mockGradesList);
    });

    it('존재하지 않는 시험의 성적을 조회할 때, NotFoundException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(null);

      await expect(
        gradesService.getGradesByExam(mockExam.id, mockUserType, mockProfileId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('[조회] getGradeDetail (학생/학부모용)', () => {
    it('과제 결과와 프리셋 배열을 함께 반환한다', async () => {
      const gradeId = 'grade-1';
      const mockGrade = {
        score: 92,
        rank: 1,
        examId: mockExam.id,
        lectureEnrollmentId: 'le-1',
        exam: {
          title: '중간고사',
          category: '정기고사',
          questions: [
            {
              id: 'q1',
              questionNumber: 1,
              content: '문제 1',
              type: 'MULTIPLE',
              source: null,
              category: '유형1',
              score: 10,
              correctAnswer: 'A',
              statistic: {
                correctRate: 70,
                choiceRates: null,
              },
            },
            {
              id: 'q2',
              questionNumber: 2,
              content: '문제 2',
              type: 'ESSAY',
              source: 'EBS',
              category: '서술형',
              score: 5,
              correctAnswer: '정답',
              statistic: {
                correctRate: 100,
                choiceRates: null,
              },
            },
          ],
          assignmentsOnExamReport: [
            {
              assignment: {
                id: 'a1',
                title: '과제1',
                category: {
                  name: '주간테스트',
                  resultPresets: ['C', 'B', 'A'],
                },
              },
            },
          ],
        },
        lectureEnrollment: {
          enrollment: {
            studentName: '홍길동',
          },
          assignmentResults: [{ assignmentId: 'a1', resultIndex: 2 }],
          studentAnswers: [
            {
              questionId: 'q1',
              submittedAnswer: 'A',
              isCorrect: true,
            },
            {
              questionId: 'q2',
              submittedAnswer: '오답',
              isCorrect: false,
            },
          ],
        },
      } as unknown as Awaited<
        ReturnType<typeof mockGradesRepo.findGradeReportByGradeId>
      >;

      mockGradesRepo.findGradeReportByGradeId.mockResolvedValue(mockGrade);
      mockGradesRepo.calculateRankByExamId.mockResolvedValue(1);
      mockGradesRepo.calculateAverageByExamId.mockResolvedValue(88.8);

      const result = await gradesService.getGradeDetail(
        gradeId,
        mockUserType,
        mockProfileId,
      );

      expect(
        mockPermissionService.validateLectureEnrollmentReadAccess,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ enrollment: { studentName: '홍길동' } }),
        mockUserType,
        mockProfileId,
      );
      expect(result.assignments).toEqual([
        {
          assignmentId: 'a1',
          title: '과제1',
          categoryName: '주간테스트',
          resultIndex: 2,
          resultPresets: ['C', 'B', 'A'],
        },
      ]);
      expect(result.questions).toEqual([
        {
          questionNumber: 1,
          content: '문제 1',
          type: 'MULTIPLE',
          source: null,
          category: '유형1',
          score: 10,
          correctAnswer: 'A',
          correctRate: 70,
          choiceRates: null,
          submittedAnswer: 'A',
          isCorrect: true,
        },
        {
          questionNumber: 2,
          content: '문제 2',
          type: 'ESSAY',
          source: 'EBS',
          category: '서술형',
          score: 5,
          correctAnswer: '정답',
          correctRate: 100,
          choiceRates: null,
          submittedAnswer: '오답',
          isCorrect: false,
        },
      ]);
      expect(result.examCategory).toBe('정기고사');
      expect(result.average).toBe(88.8);
    });
  });

  describe('[조회] getGradeDetailForInstructor', () => {
    it('유효한 요청에 대해 성적 및 답안 정보를 반환한다', async () => {
      // 준비
      const gradeId = 'grade-1';
      const mockGradeWithDetails = {
        id: gradeId,
        score: 90,
        isPass: true,
        examId: mockExam.id,
        lectureEnrollmentId: 'le-1',
        exam: {
          title: '중간고사',
          lectureId: mockExam.lectureId,
          questions: [
            {
              id: 'q1',
              examId: mockExam.id,
              lectureId: mockExam.lectureId,
              questionNumber: 1,
              type: 'MULTIPLE',
              score: 10,
              content: 'Q1 Content',
              correctAnswer: 'A',
              choices: { '1': 'A', '2': 'B', '3': 'C', '4': 'D' },
              source: null,
              category: null,
            },
          ],
        },
        lectureEnrollment: {
          id: 'le-1',
          enrollment: {
            studentName: '홍길동',
          },
        },
      };

      const mockStudentAnswers = [
        {
          id: 'sa-1',
          lectureId: mockExam.lectureId,
          createdAt: new Date(),
          lectureEnrollmentId: 'le-1',
          questionId: 'q1',
          submittedAnswer: 'A',
          isCorrect: true,
        },
      ];

      mockGradesRepo.findByIdWithDetails.mockResolvedValue(
        mockGradeWithDetails as unknown as Awaited<
          ReturnType<typeof mockGradesRepo.findByIdWithDetails>
        >,
      );
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);

      // Mocking prisma.studentAnswer.findMany
      (mockPrisma.studentAnswer.findMany as jest.Mock).mockResolvedValue(
        mockStudentAnswers,
      );

      // 실행
      const result = await gradesService.getGradeDetailForInstructor(
        gradeId,
        mockUserType,
        mockProfileId,
      );

      // 검증
      expect(mockGradesRepo.findByIdWithDetails).toHaveBeenCalledWith(gradeId);
      expect(mockLecturesRepo.findById).toHaveBeenCalledWith(
        mockExam.lectureId,
      );
      expect(mockPermissionService.validateInstructorAccess).toHaveBeenCalled();

      // Verify findMany call arguments
      expect(mockPrisma.studentAnswer.findMany).toHaveBeenCalledWith({
        where: {
          lectureEnrollmentId: 'le-1',
          question: { examId: mockExam.id },
        },
      });

      expect(result).toBeDefined();
      expect(result.studentName).toBe('홍길동');
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].submittedAnswer).toBe('A');
      expect(result.questions[0].isCorrect).toBe(true);
    });

    it('성적 정보가 존재하지 않을 때, NotFoundException을 던진다', async () => {
      mockGradesRepo.findByIdWithDetails.mockResolvedValue(null);

      await expect(
        gradesService.getGradeDetailForInstructor(
          'grade-1',
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('[리포트] getGradeReport', () => {
    it('유효한 요청에 대해 성적 리포트 정보를 반환한다', async () => {
      // 준비
      const gradeId = 'grade-1';
      const mockGradeReportData = {
        score: 90,
        rank: 5,
        isPass: true,
        exam: {
          title: '기말고사',
          examDate: new Date('2024-06-20'),
          description: '1학기 기말고사',
          category: '정기고사',
          gradesCount: 100,
          averageScore: 75.5,
          questions: [
            {
              id: 'q1',
              questionNumber: 1,
              content: 'Q1',
              source: 'EBS',
              category: '유형1',
              statistic: { correctRate: 80.0 },
            },
          ],
          assignmentsOnExamReport: [
            {
              assignment: {
                id: 'asgn-1',
                title: '과제1',
                category: {
                  name: '주간테스트',
                  resultPresets: ['C', 'B', 'A'],
                },
              },
            },
          ],
        },
        lectureEnrollment: {
          id: 'le-1',
          enrollment: {
            studentName: '김철수',
          },
          lecture: {
            title: '수학 심화반',
            instructorId: 'inst-1',
            instructor: {
              user: { name: '이강사' },
              academy: '서울학원',
              subject: '수학',
            },
          },
          studentAnswers: [
            {
              questionId: 'q1',
              isCorrect: true,
            },
          ],
          grades: [
            {
              id: 'prev-grade-1',
              score: 85,
              exam: {
                id: 'prev-exam-1',
                title: '중간고사',
                examDate: new Date('2024-04-20'),
                createdAt: new Date('2024-04-20'),
              },
            },
          ],
          assignmentResults: [
            {
              assignmentId: 'asgn-1',
              resultIndex: 2, // 'A'
            },
          ],
        },
        gradeReports: [
          {
            description: '성적표 코멘트입니다.',
          },
        ],
      };

      mockGradesRepo.findGradeReportByGradeId.mockResolvedValue(
        mockGradeReportData as unknown as Awaited<
          ReturnType<typeof mockGradesRepo.findGradeReportByGradeId>
        >,
      );
      mockAttendancesRepo.getAttendanceStatsByLectureEnrollment.mockResolvedValue(
        {
          totalCount: 10,
          absentCount: 1,
        },
      );

      // 실행
      const result = await gradesService.getGradeReport(
        gradeId,
        mockUserType,
        mockProfileId,
      );

      // 검증
      expect(mockGradesRepo.findGradeReportByGradeId).toHaveBeenCalledWith(
        gradeId,
      );
      expect(
        mockPermissionService.validateInstructorAccess,
      ).toHaveBeenCalledWith('inst-1', mockUserType, mockProfileId);
      expect(
        mockAttendancesRepo.getAttendanceStatsByLectureEnrollment,
      ).toHaveBeenCalledWith('le-1');

      expect(result.instructor.name).toBe('이강사');
      expect(result.enrollment.name).toBe('김철수');
      expect(result.exam.title).toBe('기말고사');
      expect(result.grade.score).toBe(90);
      expect(result.attendanceRate).toBe(90.0); // (10-1)/10 * 100
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0]).toEqual({
        questionNumber: 1,
        content: 'Q1',
        source: 'EBS',
        category: '유형1',
        isCorrect: true,
        wrongRate: 20,
      });

      // New assertions
      expect(result.gradeReport.description).toBe('성적표 코멘트입니다.');
      expect(result.assignments).toHaveLength(1);
      expect(result.assignments[0]).toEqual({
        assignmentId: 'asgn-1',
        title: '과제1',
        categoryName: '주간테스트',
        resultIndex: 2,
        resultPresets: ['C', 'B', 'A'],
      });
    });

    it('성적 정보가 없을 때, NotFoundException을 던진다', async () => {
      mockGradesRepo.findGradeReportByGradeId.mockResolvedValue(null);

      await expect(
        gradesService.getGradeReport('grade-1', mockUserType, mockProfileId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('[리포트] uploadGradeReportFile', () => {
    const gradeId = 'grade-1';
    const examId = 'exam-1';
    const lectureEnrollmentId = 'le-1';
    const userType = 'INSTRUCTOR';
    const profileId = 'profile-1';
    const mockFile = {
      originalname: 'test.pdf',
      path: '/tmp/mock-grade-report.pdf',
    } as Express.Multer.File;
    const reportUrl = 'https://s3.amazonaws.com/report/test.pdf';

    const mockGradeData = {
      id: gradeId,
      examId,
      lectureEnrollmentId,
      lectureEnrollment: {
        lecture: {
          id: 'lecture-1',
          instructorId: 'instructor-1',
        },
      },
    };

    it('성적표 리포트를 성공적으로 업로드해야 함', async () => {
      mockGradesRepo.findGradeReportByGradeId.mockResolvedValue(
        mockGradeData as unknown as Awaited<
          ReturnType<typeof mockGradesRepo.findGradeReportByGradeId>
        >,
      );

      mockFileStorageService.upload.mockResolvedValue(reportUrl);
      mockGradesRepo.updateGradeReportUrlByGradeId.mockResolvedValue({
        id: 'report-1',
        examId,
        gradeId,
        lectureEnrollmentId,
        description: 'Auto-generated Report',
        reportUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Awaited<
        ReturnType<typeof mockGradesRepo.updateGradeReportUrlByGradeId>
      >);

      const result = await gradesService.uploadGradeReportFile(
        gradeId,
        mockFile,
        userType,
        profileId,
      );

      expect(result).toEqual({ reportUrl });
      expect(mockGradesRepo.findGradeReportByGradeId).toHaveBeenCalledWith(
        gradeId,
      );
      expect(
        mockPermissionService.validateInstructorAccess,
      ).toHaveBeenCalledWith('instructor-1', userType, profileId);
      expect(mockFileStorageService.upload).toHaveBeenCalled();
      expect(mockGradesRepo.updateGradeReportUrlByGradeId).toHaveBeenCalledWith(
        gradeId,
        reportUrl,
      );
    });

    it('성적 정보가 없으면 NotFoundException을 던져야 함', async () => {
      mockGradesRepo.findGradeReportByGradeId.mockResolvedValue(null);

      await expect(
        gradesService.uploadGradeReportFile(
          gradeId,
          mockFile,
          userType,
          profileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
