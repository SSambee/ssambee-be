import 'dotenv/config';
import { auth } from '../config/auth.config.js';
import { UserType } from '../constants/auth.constant.js';

const [email, password, name = 'Ops Admin'] = process.argv.slice(2);

if (!email || !password) {
  console.error('usage: pnpm bootstrap:admin <email> <password> [name]');
  process.exit(1);
}

try {
  const createUser = (
    auth.api as {
      createUser?: (input: {
        body: {
          email: string;
          password: string;
          name: string;
          role: string;
          data: { userType: string };
        };
      }) => Promise<{ user: { id: string; email: string; name: string } }>;
    }
  ).createUser;

  if (!createUser) {
    throw new Error('Better Auth createUser API를 찾을 수 없습니다.');
  }

  const result = await createUser({
    body: {
      email,
      password,
      name,
      role: 'admin',
      data: {
        userType: UserType.ADMIN,
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    'admin bootstrap failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
