import { fakerKO as faker } from '@faker-js/faker';
import { MaterialType } from '../../constants/materials.constant.js';
import { mockInstructor, mockLectures } from './lectures.fixture.js';

/** Mock Material 데이터 */
export const mockMaterials = {
  basic: {
    id: faker.string.uuid(),
    lectureId: mockLectures.basic.id,
    uploaderInstructorId: mockInstructor.id,
    uploaderAssistantId: null,
    title: faker.commerce.productName(),
    fileUrl: faker.internet.url(),
    type: MaterialType.REFERENCE,
    description: faker.commerce.productDescription(),
    subject: '수학',
    externalDownloadUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    instructor: {
      user: {
        name: '이강사',
      },
    },
    assistant: null,
    lecture: {
      title: mockLectures.basic.title,
    },
  },

  video: {
    id: faker.string.uuid(),
    lectureId: mockLectures.basic.id,
    uploaderInstructorId: mockInstructor.id,
    uploaderAssistantId: null,
    title: '유튜브 영상 자료',
    fileUrl: 'https://youtube.com/watch?v=mock-video-id',
    type: MaterialType.VIDEO_LINK,
    description: '동영상 설명',
    subject: '수학',
    externalDownloadUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    instructor: {
      user: {
        name: '이강사',
      },
    },
    assistant: null,
    lecture: {
      title: mockLectures.basic.title,
    },
  },

  exam: {
    id: faker.string.uuid(),
    lectureId: mockLectures.basic.id,
    uploaderInstructorId: mockInstructor.id,
    uploaderAssistantId: null,
    title: '시험지 자료',
    fileUrl: 'https://s3.aws.com/exams/mock-exam.pdf',
    type: MaterialType.EXAM_PAPER,
    description: '시험지 설명',
    subject: '수학',
    externalDownloadUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    instructor: {
      user: {
        name: '이강사',
      },
    },
    assistant: null,
    lecture: {
      title: mockLectures.basic.title,
    },
  },
};

/** 자료 생성 요청 DTO Mock */
export const mockMaterialRequest = {
  upload: {
    title: '새로운 강의 자료',
    type: MaterialType.REFERENCE,
    description: '자료 설명입니다.',
  },
  video: {
    title: '새로운 영상 자료',
    type: MaterialType.VIDEO_LINK,
    youtubeUrl: 'https://youtube.com/watch?v=new-video',
  },
};
