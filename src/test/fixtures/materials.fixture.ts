import { fakerKO as faker } from '@faker-js/faker';
import { MaterialType } from '../../constants/materials.constant.js';
import { mockInstructor, mockLectures } from './lectures.fixture.js';

/** Mock Material 데이터 */
export const mockMaterials = {
  basic: {
    id: faker.string.uuid(),
    lectureId: mockLectures.basic.id,
    instructorId: mockInstructor.id,
    authorName: '이강사',
    authorRole: 'INSTRUCTOR',
    title: faker.commerce.productName(),
    filename: 'sample.pdf',
    fileUrl: faker.internet.url(),
    type: MaterialType.OTHER,
    description: faker.commerce.productDescription(),
    subject: '수학',
    externalDownloadUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lecture: {
      title: mockLectures.basic.title,
    },
  },

  video: {
    id: faker.string.uuid(),
    lectureId: mockLectures.basic.id,
    instructorId: mockInstructor.id,
    authorName: '이강사',
    authorRole: 'INSTRUCTOR',
    title: '유튜브 영상 자료',
    filename: '', // VIDEO는 파일이 없으므로 빈 문자열
    fileUrl: 'https://youtube.com/watch?v=mock-video-id',
    type: MaterialType.VIDEO,
    description: '동영상 설명',
    subject: '수학',
    externalDownloadUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lecture: {
      title: mockLectures.basic.title,
    },
  },

  exam: {
    id: faker.string.uuid(),
    lectureId: mockLectures.basic.id,
    instructorId: mockInstructor.id,
    authorName: '이강사',
    authorRole: 'INSTRUCTOR',
    title: '시험지 자료',
    filename: 'exam.pdf',
    fileUrl: 'https://s3.aws.com/exams/mock-exam.pdf',
    type: MaterialType.PAPER,
    description: '시험지 설명',
    subject: '수학',
    externalDownloadUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    lecture: {
      title: mockLectures.basic.title,
    },
  },
};

/** 자료 생성 요청 DTO Mock */
export const mockMaterialRequest = {
  upload: {
    title: '새로운 강의 자료',
    type: MaterialType.OTHER,
    description: '자료 설명입니다.',
  },
  video: {
    title: '새로운 영상 자료',
    type: MaterialType.VIDEO,
    youtubeUrl: 'https://youtube.com/watch?v=new-video',
  },
};
