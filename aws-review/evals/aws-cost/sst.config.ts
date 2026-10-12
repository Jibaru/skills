/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "orders",
      home: "aws",
      removal: input?.stage === "production" ? "retain" : "remove",
    };
  },
  async run() {
    const vpc = new sst.aws.Vpc("Vpc");

    const db = new sst.aws.Aurora("OrdersDb", {
      engine: "postgres",
      vpc,
    });

    const reports = new sst.aws.Function("Reports", {
      handler: "src/handlers/reports.handler",
      architecture: "arm64",
      memory: "512 MB",
      link: [db],
      vpc,
    });

    return { reports: reports.name };
  },
});
