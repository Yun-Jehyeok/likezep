/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "game-no-react",
      comment:
        "PixiJS 계층은 React를 모릅니다. UI 연동이 필요하면 core/store를 통해 상태를 구독하세요.",
      severity: "error",
      from: { path: "^apps/client/src/game/" },
      to: { dependencyTypes: ["npm"], path: "^react($|[-/])" },
    },
    {
      name: "protocol-single-source",
      comment:
        "메시지 타입은 packages/shared/protocol에 추가하고 양쪽에서 import하세요.",
      severity: "error",
      from: { path: "^apps/" },
      to: { path: "^apps/.+/protocol/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    moduleSystems: ["es6", "cjs"],
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};
