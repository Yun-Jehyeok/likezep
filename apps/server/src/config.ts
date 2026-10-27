import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(2567),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().default("dev-secret-change-in-production"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  TURN_SECRET: z.string().optional(),
  TURN_HOST: z.string().optional(),
  TURN_PORT: z.coerce.number().default(3478),
  TURN_TTL: z.coerce.number().default(86400),
  MEDIASOUP_ANNOUNCED_IP: z.string().optional(),
  NODE_ENV: z.string().default("production"),
  SENTRY_DSN: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  // Sentry environment tag. NODE_ENV와 분리 — 스테이징도 NODE_ENV=production으로 돌기 때문.
  // 미설정 시 NODE_ENV로 fallback.
  SENTRY_ENVIRONMENT: z.string().optional(),
  E2E_ENABLED: z.string().optional().transform((v) => v === "true"),
  MONITOR_PASSWORD: z.string().default("changeme"),
  // 콤마 구분 허용 origin 목록. "*"이면 전체 허용 (현행 동작 유지).
  // 프로덕션 예: "https://like-zep.shop,https://www.like-zep.shop"
  CORS_ORIGINS: z.string().default("*"),
  // 강의 영상/자료 S3 버킷. 기본값은 개발/스테이징 버킷명.
  S3_VIDEOS_BUCKET: z.string().default("likezep-videos-prod"),
  // 영상 버킷 리전
  AWS_VIDEOS_REGION: z.string().default("ap-northeast-2"),
  // 영상 버킷에 CloudFront CDN이 붙어있으면 해당 base URL (썸네일 정적 URL에 사용).
  // 미설정이면 썸네일도 presigned URL로 fallback.
  VIDEOS_CDN_URL: z.string().optional(),
});

export const config = schema.parse(process.env);
