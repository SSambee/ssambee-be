import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc } from 'better-auth/plugins/admin/access';

// 기본 권한 + 커스텀 권한 정의
const statement = {
  user: [
    'create',
    'list',
    'size',
    'set-role',
    'ban',
    'impersonate',
    'delete',
    'set-password',
    'get',
    'update',
  ],
  session: ['list', 'revoke', 'delete', 'get'],
} as const;

export const ac = createAccessControl(statement);

// 역할 정의
export const user = ac.newRole({
  user: [],
  session: [],
});

export const admin = ac.newRole({
  ...adminAc.statements,
});

// 강사 역할: 유저 삭제 권한만 부여 (조교 탈퇴 처리용)
export const instructor = ac.newRole({
  user: ['delete'],
});
