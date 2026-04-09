import { NextFunction, Request, Response } from 'express';
import { ProfileController } from './profile.controller.js';
import { UserType } from '../constants/auth.constant.js';
import { toKstIsoString } from '../utils/date.util.js';

describe('ProfileController - @unit', () => {
  let mockProfileService: {
    getMyProfile: jest.Mock;
    updateMyProfile: jest.Mock;
  };
  let profileController: ProfileController;
  let mockReq: Partial<Request> & {
    user?: unknown;
    profile?: unknown;
  };
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockProfileService = {
      getMyProfile: jest.fn(),
      updateMyProfile: jest.fn(),
    };

    profileController = new ProfileController(mockProfileService as never);

    mockReq = {
      user: {
        id: 'user-1',
        email: 'inst@test.com',
        name: 'Instructor Name',
        userType: UserType.INSTRUCTOR,
      } as never,
      profile: {
        id: 'inst-1',
      } as never,
      body: {},
      headers: {},
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  it('강사 프로필 조회 시 활성 이용권의 startsAt/endsAt을 KST 문자열로 변환해야 한다', async () => {
    const startsAt = new Date('2026-03-24T00:00:00.000Z');
    const endsAt = new Date('2026-04-23T14:59:59.999Z');
    const createdAt = new Date('2026-03-24T00:00:00.000Z');

    mockProfileService.getMyProfile.mockResolvedValue({
      id: 'inst-1',
      name: 'Instructor Name',
      email: 'inst@test.com',
      phoneNumber: '010-1234-5678',
      subject: 'Math',
      academy: 'ABC',
      userType: UserType.INSTRUCTOR,
      createdAt,
      activeEntitlement: {
        id: 'entitlement-1',
        status: 'ACTIVE',
        startsAt,
        endsAt,
        includedCreditAmount: 1000,
      },
      creditSummary: {
        totalAvailable: 1000,
      },
      lectures: [],
    });

    await profileController.getMyProfile(
      mockReq as Request,
      mockRes as Response,
      mockNext,
    );

    expect(mockProfileService.getMyProfile).toHaveBeenCalledWith(
      'inst-1',
      UserType.INSTRUCTOR,
    );
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        message: '내 프로필 조회 성공',
        data: expect.objectContaining({
          createdAt: toKstIsoString(createdAt),
          activeEntitlement: {
            id: 'entitlement-1',
            status: 'ACTIVE',
            startsAt: toKstIsoString(startsAt),
            endsAt: toKstIsoString(endsAt),
            includedCreditAmount: 1000,
          },
          creditSummary: {
            totalAvailable: 1000,
          },
        }),
      }),
    );
  });
});
