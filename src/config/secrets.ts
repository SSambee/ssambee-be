import { SSMClient, GetParametersCommand } from '@aws-sdk/client-ssm';

export async function loadSecrets() {
  const env = process.env.NODE_ENV || 'development';

  // 배포환경 or 테스트 환경이면 SSM 로드 스킵
  if (env === 'production' || env === 'test') {
    return;
  }
  const ssm = new SSMClient({ region: 'ap-northeast-2' });
  const prefix = `/ssambee/${env}`;

  try {
    const command = new GetParametersCommand({
      Names: [
        `${prefix}/REDIS_URL`,
        `${prefix}/ALARM_LAMBDA_URL`,
        `${prefix}/AWS_CLOUDFRONT_PRIVATE_KEY`,
      ],
      WithDecryption: true,
    });
    const response = await ssm.send(command);

    response.Parameters?.forEach((p) => {
      if (p.Name && p.Value) {
        // 경로의 키 이름만 추출 (/ssambee/dev/REDIS_URL -> REDIS_URL)
        const key = p.Name.split('/').pop()!;
        process.env[key] = p.Value;
      }
    });

    console.log(`${env}환경 설정 로드 완료`);
  } catch (error) {
    console.error('시크릿키 로드 실패', error);
    process.exit(1);
  }
}
