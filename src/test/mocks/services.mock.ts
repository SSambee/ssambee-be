import type { AuthService } from '../../services/auth.service.js';
import type { ParentsService } from '../../services/parents.service.js';
import type { PermissionService } from '../../services/permission.service.js';
import type { FileStorageService } from '../../services/filestorage.service.js';
import type { CommentsService } from '../../services/comments.service.js';

/** Mock AuthService 생성 */
export const createMockAuthService = (): jest.Mocked<AuthService> =>
  ({
    completeSignUpWithVerifiedEmail: jest.fn(),
    signIn: jest.fn(),
    requestEmailVerification: jest.fn(),
    verifyEmailVerification: jest.fn(),
    verifyEmailWithToken: jest.fn(),
    changeMyEmail: jest.fn(),
    changeMyPassword: jest.fn(),
    findPassword: jest.fn(),
    resetPasswordWithOTP: jest.fn(),
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
    findLinkByPhoneNumberAndProfile: jest.fn(),
    validateChildAccess: jest.fn(),
  }) as unknown as jest.Mocked<ParentsService>;

/** Mock PermissionService 생성 */
export const createMockPermissionService = (): jest.Mocked<PermissionService> =>
  ({
    validateInstructorAccess: jest.fn(),
    getEffectiveInstructorId: jest.fn(),
    validateStudentAccess: jest.fn(),
    validateChildAccess: jest.fn(),
    validateLectureEnrollmentReadAccess: jest.fn(),
    validateEnrollmentReadAccess: jest.fn(),
    validateLectureReadAccess: jest.fn(),
    validateInstructorStudentLink: jest.fn(),
    getInstructorIdByAssistantId: jest.fn(),
    getChildLinks: jest.fn(),
    getParentEnrollmentIds: jest.fn(),
  }) as unknown as jest.Mocked<PermissionService>;

/** Mock FileStorageService 생성 */
export const createMockFileStorageService =
  (): jest.Mocked<FileStorageService> =>
    ({
      upload: jest.fn(),
      getPresignedUrl: jest.fn(async (url) => url),
      delete: jest.fn(),
    }) as unknown as jest.Mocked<FileStorageService>;

/** Mock CommentsService 생성 */
export const createMockCommentsService = (): jest.Mocked<CommentsService> =>
  ({
    addIsMineFieldToComment: jest.fn((comment) => comment),
    createComment: jest.fn(),
    updateComment: jest.fn(),
    deleteComment: jest.fn(),
    deleteCommentAttachmentsByPostId: jest.fn(),
    getCommentsByPostId: jest.fn(),
  }) as unknown as jest.Mocked<CommentsService>;
