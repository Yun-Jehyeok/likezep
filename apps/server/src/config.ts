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
  E2E_ENABLED: z.string().optional().transform((v) => v === "true"),
  MONITOR_PASSWORD: z.string().default("changeme"),
  // 콤마 구분 허용 origin 목록. "*"이면 전체 허용 (현행 동작 유지).
  // 프로덕션 예: "https://like-zep.shop,https://www.like-zep.shop"
  CORS_ORIGINS: z.string().default("*"),
});

export const config = schema.parse(process.env);
