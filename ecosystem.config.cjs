// pm2 ecosystem file — EC2 배포용
// apps/server/.env 를 자동으로 로드하므로 별도 환경변수 설정 불필요
module.exports = {
  apps: [
    {
      name: "likezep-server",
      script: "apps/server/dist/index.js",
      cwd: "/home/ubuntu/likezep",
      env_file: "/home/ubuntu/likezep/apps/server/.env",
    },
  ],
};
