import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';

export class AssistantCodeRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async findValidCode(code: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assistantCode.findFirst({
      where: {
        code,
        isUsed: false,
        expireAt: {
          gt: new Date(),
        },
      },
    });
  }

  async markAsUsed(id: string, tx?: Prisma.TransactionClient) {
    // 트랜잭션 클라이언트가 있으면 사용하고, 없으면 기본 prisma 인스턴스 사용
    const client = tx ?? this.prisma;
    const now = new Date();

    // 원자적 업데이트: 조건(사용 안 됨, 만료 안 됨) 확인과 업데이트를 동시에 수행
    const result = await client.assistantCode.updateMany({
      where: {
        id,
        isUsed: false,
        expireAt: { gt: now }, // 만료 시간 체크도 포함
      },
      data: { isUsed: true },
    });

    // 업데이트된 행이 0개라면: 이미 사용되었거나, 만료되었거나, 존재하지 않음
    if (result.count === 0) {
      return null;
    }

    // 성공적으로 업데이트된 경우, 결과 반환
    return client.assistantCode.findUnique({ where: { id } });
  }

  async create(
    data: {
      code: string;
      instructorId: string;
      expireAt: Date;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assistantCode.create({
      data,
    });
  }

  async findByInstructorId(
    instructorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assistantCode.findMany({
      where: { instructorId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
