/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "shop",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const sessions = new sst.aws.Dynamo("Sessions", {
      fields: {
        pk: "string",
      },
      primaryIndex: { hashKey: "pk" },
      ttl: "expiresAt",
      deletionProtection: $app.stage === "production",
    });

    const api = new sst.aws.ApiGatewayV2("Api");
    api.route("POST /sessions", {
      handler: "src/sessions/create.handler",
      link: [sessions],
    });

    return { api: api.url };
  },
});
