import type { SuiCodegenConfig } from "@mysten/codegen";

const config: SuiCodegenConfig = {
  output: "./src/contracts",
  packages: [
    {
      package: "@local-pkg/counter",
      path: "./move/counter",
    },
    {
      package: "@local-pkg/content_vault",
      path: "./move/content_vault",
    },
  ],
};

export default config;
