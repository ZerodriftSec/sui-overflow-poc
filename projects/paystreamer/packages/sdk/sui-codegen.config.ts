import type { SuiCodegenConfig } from "@mysten/codegen";

const config: SuiCodegenConfig = {
  output: "./src/contracts",
  packages: [
    {
      package: "@local-pkg/subscriptions",
      path: "../../move/subscriptions",
    },
  ],
};

export default config;
