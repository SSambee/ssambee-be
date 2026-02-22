import { prisma } from '../../config/db.config.js';

/**
 * 테스트용 데이터베이스 유틸리티
 */
interface TableNameResult {
  tablename: string;
}

export const dbTestUtil = {
  /**
   * 모든 테이블 데이터 삭제
   * 주의: 외래 키 제약 조건으로 인해 삭제 순서가 중요함
   */
  async truncateAll() {
    try {
      // 1. 테이블 목록 조회
      const result = await prisma.$queryRawUnsafe<TableNameResult[]>(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != '_prisma_migrations'",
      );

      if (!result || result.length === 0) {
        console.log('⚠️ No tables found to truncate.');
        return;
      }

      const tables = result.map((row) => `"${row.tablename}"`).join(', ');

      // 2. 일괄 삭제
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
      // console.log(`✅ Truncated tables: ${tables}`);
    } catch (error: unknown) {
      console.error('❌ Error truncating tables:', error);
      throw error;
    }
  },

  /**
   * 데이터베이스 연결 종료
   */
  async disconnect() {
    await prisma.$disconnect();
  },
};
