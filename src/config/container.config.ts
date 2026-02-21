import { prisma } from './db.config.js';
import { auth } from './auth.config.js';

import { AssignmentsRepository } from '../repos/assignments.repo.js';
import { AssignmentResultsRepository } from '../repos/assignment-results.repo.js';

import { InstructorRepository } from '../repos/instructor.repo.js';
import { StudentRepository } from '../repos/student.repo.js';
import { AssistantRepository } from '../repos/assistant.repo.js';
import { ParentRepository } from '../repos/parent.repo.js';
import { AssistantCodeRepository } from '../repos/assistant-code.repo.js';
import { AssistantOrderRepository } from '../repos/assistant-order.repo.js';
import { ScheduleCategoryRepository } from '../repos/schedule-categories.repo.js';
import { SchedulesRepository } from '../repos/schedules.repo.js';

import { AuthService } from '../services/auth.service.js';
import { AuthController } from '../controllers/auth.controller.js';
import {
  createRequireAuth,
  createOptionalAuth,
  createRoleMiddlewares,
} from '../middlewares/auth.middleware.js';

import { LecturesRepository } from '../repos/lectures.repo.js';
import { LecturesService } from '../services/lectures.service.js';
import { LecturesController } from '../controllers/lectures.controller.js';

import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import { EnrollmentsService } from '../services/enrollments.service.js';
import { EnrollmentsController } from '../controllers/enrollments.controller.js';

import { AttendancesRepository } from '../repos/attendances.repo.js';
import { AttendancesService } from '../services/attendances.service.js';
import { AttendancesController } from '../controllers/attendances.controller.js';

import { ParentChildLinkRepository } from '../repos/parent-child-link.repo.js';
import { ExamsRepository } from '../repos/exams.repo.js';

import { ParentsService } from '../services/parents.service.js';
import { PermissionService } from '../services/permission.service.js';
import { ExamsService } from '../services/exams.service.js';

import { ChildrenController } from '../controllers/children.controller.js';
import { ExamsController } from '../controllers/exams.controller.js';
import { GradesController } from '../controllers/grades.controller.js';

import { GradesRepository } from '../repos/grades.repo.js';
import { GradesService } from '../services/grades.service.js';

import { StatisticsRepository } from '../repos/statistics.repo.js';
import { StatisticsService } from '../services/statistics.service.js';
import { StatisticsController } from '../controllers/statistics.controller.js';

import { ClinicsRepository } from '../repos/clinics.repo.js';
import { ClinicsService } from '../services/clinics.service.js';
import { ClinicsController } from '../controllers/clinics.controller.js';

import { MaterialsRepository } from '../repos/materials.repo.js';
import { FileStorageService } from '../services/filestorage.service.js';
import { MaterialsService } from '../services/materials.service.js';
import { MaterialsController } from '../controllers/materials.controller.js';
import { LectureEnrollmentsService } from '../services/lecture-enrollments.service.js';
import { LectureEnrollmentsController } from '../controllers/lecture-enrollments.controller.js';

import { InstructorPostsRepository } from '../repos/instructor-posts.repo.js';
import { StudentPostsRepository } from '../repos/student-posts.repo.js';
import { CommentsRepository } from '../repos/comments.repo.js';

import { InstructorPostsService } from '../services/instructor-posts.service.js';
import { StudentPostsService } from '../services/student-posts.service.js';
import { CommentsService } from '../services/comments.service.js';

import { InstructorPostsController } from '../controllers/instructor-posts.controller.js';
import { StudentPostsController } from '../controllers/student-posts.controller.js';
import { CommentsController } from '../controllers/comments.controller.js';
import { AssistantCodesService } from '../services/assistant-codes.service.js';
import { AssistantCodesController } from '../controllers/assistant-codes.controller.js';

import { AssistantsService } from '../services/assistants.service.js';
import { AssistantsController } from '../controllers/assistants.controller.js';

import { AssistantOrderService } from '../services/assistant-order.service.js';
import { AssistantOrderController } from '../controllers/assistant-order.controller.js';

import { ScheduleCategoryService } from '../services/schedule-categories.service.js';
import { ScheduleCategoryController } from '../controllers/schedule-categories.controller.js';

import { SchedulesService } from '../services/schedules.service.js';
import { SchedulesController } from '../controllers/schedules.controller.js';
import { UploadsController } from '../controllers/uploads.controller.js';
/**
 *  import { redis } from './redis.config.js';
 *  redis 클라이언트르 컨테이너에 등록하여 필요한 서비스에 주입한다.
 */

import { AssignmentsService } from '../services/assignments.service.js';
import { AssignmentsController } from '../controllers/assignments.controller.js';

import { AssignmentResultsService } from '../services/assignment-results.service.js';
import { AssignmentResultsController } from '../controllers/assignment-results.controller.js';

import { ProfileRepository } from '../repos/profile.repo.js';
import { ProfileService } from '../services/profile.service.js';
import { ProfileController } from '../controllers/profile.controller.js';

// 1. Instantiate Repositories
const instructorRepo = new InstructorRepository(prisma);
const studentRepo = new StudentRepository(prisma);
const assistantRepo = new AssistantRepository(prisma);
const parentRepo = new ParentRepository(prisma);
const assistantCodeRepo = new AssistantCodeRepository(prisma);
const assistantOrderRepo = new AssistantOrderRepository(prisma);
const scheduleCategoryRepo = new ScheduleCategoryRepository(prisma);
const schedulesRepo = new SchedulesRepository(prisma);
const parentChildLinkRepo = new ParentChildLinkRepository(prisma);
const examsRepo = new ExamsRepository(prisma);
const gradesRepo = new GradesRepository(prisma);
const statisticsRepo = new StatisticsRepository(prisma);
const clinicsRepo = new ClinicsRepository(prisma);
const materialsRepo = new MaterialsRepository(prisma);
const assignmentsRepo = new AssignmentsRepository(prisma);
const assignmentResultsRepo = new AssignmentResultsRepository(prisma);

const lecturesRepo = new LecturesRepository(prisma);
const enrollmentsRepo = new EnrollmentsRepository(prisma);
const lectureEnrollmentsRepo = new LectureEnrollmentsRepository(prisma);
const attendancesRepo = new AttendancesRepository(prisma);

const instructorPostsRepo = new InstructorPostsRepository(prisma);
const studentPostsRepo = new StudentPostsRepository(prisma);
const commentsRepo = new CommentsRepository(prisma);
const profileRepo = new ProfileRepository(prisma);

// 2. Instantiate Services (Inject Repos)
const fileStorageService = new FileStorageService();

const profileService = new ProfileService(profileRepo, prisma);

const authService = new AuthService(
  instructorRepo,
  assistantRepo,
  assistantCodeRepo,
  studentRepo,
  parentRepo,
  enrollmentsRepo,
  auth,
  prisma,
);

const permissionService = new PermissionService(
  assistantRepo,
  parentChildLinkRepo,
  lectureEnrollmentsRepo,
  enrollmentsRepo,
);

const examsService = new ExamsService(
  examsRepo,
  lecturesRepo,
  permissionService,
  prisma,
);

const gradesService = new GradesService(
  gradesRepo,
  examsRepo,
  lecturesRepo,
  lectureEnrollmentsRepo,
  attendancesRepo,
  permissionService,
  fileStorageService,
  prisma,
);

const statisticsService = new StatisticsService(
  statisticsRepo,
  examsRepo,
  lecturesRepo,
  gradesRepo,
  permissionService,
  prisma,
);

const clinicsService = new ClinicsService(
  clinicsRepo,
  examsRepo,
  lecturesRepo,
  permissionService,
  prisma,
);

const lecturesService = new LecturesService(
  lecturesRepo,
  enrollmentsRepo,
  lectureEnrollmentsRepo,
  instructorRepo,
  permissionService,
  prisma,
);
const parentsService = new ParentsService(
  parentRepo,
  parentChildLinkRepo,
  enrollmentsRepo,
  lectureEnrollmentsRepo,
  permissionService,
  prisma,
);

const enrollmentsService = new EnrollmentsService(
  enrollmentsRepo,
  lecturesRepo,
  lectureEnrollmentsRepo,
  studentRepo,
  parentsService,
  permissionService,
  prisma,
);

const attendancesService = new AttendancesService(
  attendancesRepo,
  enrollmentsRepo,
  lectureEnrollmentsRepo,
  lecturesRepo,
  assistantRepo,
  parentsService,
  permissionService,
  prisma,
);

const lectureEnrollmentsService = new LectureEnrollmentsService(
  lectureEnrollmentsRepo,
  gradesRepo,
  statisticsRepo,
  permissionService,
  prisma,
);

const assistantCodesService = new AssistantCodesService(
  assistantCodeRepo,
  prisma,
);

const assistantsService = new AssistantsService(
  assistantRepo,
  authService,
  prisma,
);

const materialsService = new MaterialsService(
  materialsRepo,
  lecturesRepo,
  lectureEnrollmentsRepo,
  instructorRepo,
  assistantRepo,
  fileStorageService,
  permissionService,
  prisma,
);

const commentsService = new CommentsService(
  commentsRepo,
  instructorPostsRepo,
  studentPostsRepo,
  enrollmentsRepo,
  lectureEnrollmentsRepo,
  materialsRepo,
  permissionService,
  parentChildLinkRepo,
  fileStorageService,
);

const instructorPostsService = new InstructorPostsService(
  instructorPostsRepo,
  lecturesRepo,
  materialsRepo,
  lectureEnrollmentsRepo,
  enrollmentsRepo,
  permissionService,
  studentPostsRepo,
  commentsService,
);

const studentPostsService = new StudentPostsService(
  studentPostsRepo,
  enrollmentsRepo,
  lectureEnrollmentsRepo,
  lecturesRepo,
  commentsRepo,
  permissionService,
  commentsService,
  fileStorageService,
);

const assistantOrderService = new AssistantOrderService(
  assistantOrderRepo,
  assistantRepo,
  materialsRepo,
  prisma,
);

const scheduleCategoryService = new ScheduleCategoryService(
  scheduleCategoryRepo,
  prisma,
);

const schedulesService = new SchedulesService(
  schedulesRepo,
  scheduleCategoryRepo,
  prisma,
);

const assignmentsService = new AssignmentsService(assignmentsRepo, prisma);

const assignmentResultsService = new AssignmentResultsService(
  assignmentResultsRepo,
  assignmentsRepo,
  lectureEnrollmentsRepo,
  prisma,
);

// 3. Instantiate Controllers (Inject Services)
const authController = new AuthController(authService);
const lecturesController = new LecturesController(lecturesService);
const enrollmentsController = new EnrollmentsController(enrollmentsService);
const attendancesController = new AttendancesController(attendancesService);
const childrenController = new ChildrenController(
  parentsService,
  gradesService,
  clinicsService,
);
const examsController = new ExamsController(examsService);
const gradesController = new GradesController(gradesService);
const statisticsController = new StatisticsController(statisticsService);
const clinicsController = new ClinicsController(clinicsService);
const materialsController = new MaterialsController(materialsService);
const lectureEnrollmentsController = new LectureEnrollmentsController(
  lectureEnrollmentsService,
);
const assistantCodesController = new AssistantCodesController(
  assistantCodesService,
);
const assistantsController = new AssistantsController(assistantsService);
const assistantOrderController = new AssistantOrderController(
  assistantOrderService,
);
const scheduleCategoryController = new ScheduleCategoryController(
  scheduleCategoryService,
);
const schedulesController = new SchedulesController(schedulesService);
const assignmentsController = new AssignmentsController(assignmentsService);
const assignmentResultsController = new AssignmentResultsController(
  assignmentResultsService,
);

const instructorPostsController = new InstructorPostsController(
  instructorPostsService,
);
const studentPostsController = new StudentPostsController(studentPostsService);
const commentsController = new CommentsController(commentsService);
const uploadsController = new UploadsController(fileStorageService);

// 4. Create Middlewares (Inject Services)
const requireAuth = createRequireAuth(authService);
const optionalAuth = createOptionalAuth(authService);
const {
  requireInstructor,
  requireInstructorOrAssistant,
  requireStudent,
  requireParent,
  requireStudentOrParent,
} = createRoleMiddlewares();

// 5. Export Wired Instances (Container)
export const container = {
  // Services
  authService,
  lecturesService,
  enrollmentsService,
  attendancesService,
  parentsService,
  statisticsService,
  clinicsService,
  materialsService,
  lectureEnrollmentsService,
  assistantsService,
  scheduleCategoryService,
  schedulesService,
  assignmentsService,
  assignmentResultsService,
  fileStorageService,
  // Controllers
  authController,
  lecturesController,
  enrollmentsController,
  attendancesController,
  childrenController,
  examsController,
  gradesController,
  statisticsController,
  clinicsController,
  materialsController,
  lectureEnrollmentsController,
  instructorPostsController,
  studentPostsController,
  commentsController,
  assistantCodesController,
  assistantsController,
  assistantOrderController,
  scheduleCategoryController,
  schedulesController,
  assignmentsController,
  assignmentResultsController,
  uploadsController,
  profileController: new ProfileController(profileService),
  // Middlewares
  requireAuth,
  optionalAuth,
  requireInstructor,
  requireInstructorOrAssistant,
  requireStudent,
  requireParent,
  requireStudentOrParent,
};
