import type { AuthService } from '../../services/auth.service.js';
import type { ParentsService } from '../../services/parents.service.js';
import type { PermissionService } from '../../services/permission.service.js';
import type { FileStorageService } from '../../services/filestorage.service.js';

/** Mock AuthService 생성 */
export const createMockAuthService = (): jest.Mocked<AuthService> =>
  ({
    signUp: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getSession: jest.fn(),
  }) as unknown as jest.Mocked<AuthService>;

/** Mock ParentsService 생성 */
export const createMockParentsService = (): jest.Mocked<ParentsService> =>
  ({
    registerChild: jest.fn(),
    getChildren: jest.fn(),
    getChildEnrollments: jest.fn(),
    getChildEnrollmentDetail: jest.fn(),
    findLinkByPhoneNumber: jest.fn(),
    validateChildAccess: jest.fn(),
  }) as unknown as jest.Mocked<ParentsService>;

/** Mock PermissionService 생성 */
export const createMockPermissionService = (): jest.Mocked<PermissionService> =>
  ({
    validateInstructorAccess: jest.fn(),
    getEffectiveInstructorId: jest.fn(),
    validateStudentAccess: jest.fn(),
    validateChildAccess: jest.fn(),
    validateEnrollmentReadAccess: jest.fn(),
    validateLectureReadAccess: jest.fn(),
    validateInstructorStudentLink: jest.fn(),
    getInstructorIdByAssistantId: jest.fn(),
    getChildLinks: jest.fn(),
    getParentEnrollmentIds: jest.fn(),
    validateParentEnrollmentAccess: jest.fn(),
    validateParentLectureAccess: jest.fn(),
  }) as unknown as jest.Mocked<PermissionService>;

/** Mock FileStorageService 생성 */
export const createMockFileStorageService =
  (): jest.Mocked<FileStorageService> =>
    ({
      upload: jest.fn(),
      getPresignedUrl: jest.fn(),
      delete: jest.fn(),
    }) as unknown as jest.Mocked<FileStorageService>;
