import type { InstructorRepository } from '../../repos/instructor.repo.js';
import type { StudentRepository } from '../../repos/student.repo.js';
import type { AssistantRepository } from '../../repos/assistant.repo.js';
import type { ParentRepository } from '../../repos/parent.repo.js';
import type { AssistantCodeRepository } from '../../repos/assistant-code.repo.js';
import type { LecturesRepository } from '../../repos/lectures.repo.js';
import type { EnrollmentsRepository } from '../../repos/enrollments.repo.js';
import type { ParentChildLinkRepository } from '../../repos/parent-child-link.repo.js';
import type { AttendancesRepository } from '../../repos/attendances.repo.js';
import { ExamsRepository } from '../../repos/exams.repo.js';
import { GradesRepository } from '../../repos/grades.repo.js';
import { ClinicsRepository } from '../../repos/clinics.repo.js';
import { StatisticsRepository } from '../../repos/statistics.repo.js';
import type { LectureEnrollmentsRepository } from '../../repos/lecture-enrollments.repo.js';
import { createAutoMock } from './create-mock.util.js';

/** Mock InstructorRepository 생성 */
export const createMockInstructorRepository = () =>
  createAutoMock<InstructorRepository>([
    'findByUserId',
    'findById',
    'findByPhoneNumber',
    'create',
  ]);

/** Mock StudentRepository 생성 */
export const createMockStudentRepository = () =>
  createAutoMock<StudentRepository>([
    'findByUserId',
    'findById',
    'findByPhoneNumber',
    'create',
  ]);

/** Mock AssistantRepository 생성 */
export const createMockAssistantRepository = () =>
  createAutoMock<AssistantRepository>([
    'findByUserId',
    'findById',
    'findByPhoneNumber',
    'create',
  ]);

/** Mock ParentRepository 생성 */
export const createMockParentRepository = () =>
  createAutoMock<ParentRepository>([
    'findByUserId',
    'findById',
    'findByPhoneNumber',
    'create',
  ]);

/** Mock AssistantCodeRepository 생성 */
export const createMockAssistantCodeRepository = () =>
  createAutoMock<AssistantCodeRepository>(['findValidCode', 'markAsUsed']);

/** Mock ParentChildLinkRepository 생성 */
export const createMockParentChildLinkRepository = () =>
  createAutoMock<ParentChildLinkRepository>([
    'create',
    'findByAppParentId',
    'findById',
    'findByParentIdAndPhoneNumber',
    'findManyByPhoneNumber',
  ]);

/** Mock LecturesRepository 생성 */
export const createMockLecturesRepository = () =>
  createAutoMock<LecturesRepository>([
    'create',
    'findById',
    'findMany',
    'update',
    'softDelete',
    'findSimpleMany',
  ]);

/** Mock EnrollmentsRepository 생성 */
export const createMockEnrollmentsRepository = () =>
  createAutoMock<EnrollmentsRepository>([
    'createMany',
    'create',
    'findById',
    'findByIdWithRelations',
    'findByAppStudentId',
    'findByAppParentLinkId',
    'findByAppParentLinkId',
    'findMany',
    'update',
    'softDelete',
    'updateAppStudentIdByPhoneNumber',
    'updateAppParentLinkIdByStudentPhone',
    'updateAppParentLinkIdByStudentPhone',
    'findManyByInstructorAndPhones',
    'findByIdWithLectures',
  ]);

/** Mock LectureEnrollmentsRepository 생성 */
export const createMockLectureEnrollmentsRepository = () =>
  createAutoMock<LectureEnrollmentsRepository>([
    'createMany',
    'findManyByLectureId',
    'create',
    'findManyByAppStudentId',
    'findManyByAppParentLinkId',
    'findByIdWithDetails',
    'findByLectureIdAndEnrollmentId',
    'findManyByLectureIdWithEnrollments',
    'findById',
    'removeByLectureIdAndEnrollmentId',
  ]);

/** Mock AttendancesRepository 생성 */
export const createMockAttendancesRepository = () =>
  createAutoMock<AttendancesRepository>([
    'create',
    'upsert',
    'findById',
    'findByEnrollmentId',
    'update',
    'findByLectureEnrollmentId',
  ]);

/** Mock ExamsRepository 생성 */
export const createMockExamsRepository = () =>
  createAutoMock<ExamsRepository>([
    'createWithQuestions',
    'findById',
    'findByIdWithQuestions',
    'findByLectureId',
    'update',
    'createQuestion',
    'updateQuestion',
    'deleteQuestions',
    'findQuestionsByExamId',
    'updateGradingStatus',
    'findByIdWithEnrollments',
    'findByInstructorId',
    'delete',
  ]);

/** Mock GradesRepository 생성 */
export const createMockGradesRepository = () =>
  createAutoMock<GradesRepository>([
    'upsertStudentAnswers',
    'upsertGrade',
    'findGradesByExamId',
    'calculateRankByExamId',
    'calculateAverageByExamId',
    'findByIdWithDetails',
    'findByLectureEnrollmentId',
    'findGradeWithDetailsByExamAndEnrollment',
  ]);

/** Mock ClinicsRepository 생성 */
export const createMockClinicsRepository = () =>
  createAutoMock<ClinicsRepository>([
    'findFailedGradesByExamId',
    'findExistingClinics',
    'createMany',
    'findByInstructor',
    'findByIds',
    'updateMany',
  ]);

/** Mock StatisticsRepository 생성 */
export const createMockStatisticsRepository = () =>
  createAutoMock<StatisticsRepository>([
    'upsertQuestionStatistic',
    'findStatisticsByExamId',
    'countGradesByExamId',
    'findStudentAnswersByQuestionId',
    'getExamSummary',
    'getStudentCorrectCounts',
    'getStudentGradesWithInfo',
  ]);
