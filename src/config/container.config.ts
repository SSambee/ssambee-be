import { prisma } from './db.config.js';
import { auth } from './auth.config.js';

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

const lecturesRepo = new LecturesRepository(prisma);
const enrollmentsRepo = new EnrollmentsRepository(prisma);
const lectureEnrollmentsRepo = new LectureEnrollmentsRepository(prisma);
const attendancesRepo = new AttendancesRepository(prisma);

// 2. Instantiate Services (Inject Repos)
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

const fileStorageService = new FileStorageService();
const materialsService = new MaterialsService(
  materialsRepo,
  lecturesRepo,
  lectureEnrollmentsRepo,
  instructorRepo,
  assistantRepo,
  fileStorageService,
  permissionService,
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

// 4. Create Middlewares (Inject Services)
const requireAuth = createRequireAuth(authService);
const optionalAuth = createOptionalAuth(authService);
const {
  requireInstructor,
  requireInstructorOrAssistant,
  requireStudent,
  requireParent,
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
  assistantCodesController,
  assistantsController,
  assistantOrderController,
  scheduleCategoryController,
  schedulesController,
  // Middlewares
  requireAuth,
  optionalAuth,
  requireInstructor,
  requireInstructorOrAssistant,
  requireStudent,
  requireParent,
};
