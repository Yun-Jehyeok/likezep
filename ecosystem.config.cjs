// pm2 ecosystem file — EC2 배포용
// apps/server/.env 를 자동으로 로드하므로 별도 환경변수 설정 불필요
module.exports = {
  apps: [
    {
      name: "likezep-server",
      script: "pnpm",
      args: "--filter @mentoring/server dev",
      cwd: "/home/ubuntu/likezep",
      env_file: "apps/server/.env",
    },
  ],
};
