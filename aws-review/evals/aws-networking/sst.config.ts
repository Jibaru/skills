/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "orders",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const table = new sst.aws.Dynamo("Orders", {
      fields: { pk: "string", sk: "string" },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
    });

    const vpc = new sst.aws.Vpc("Vpc", { nat: "managed" });

    const api = new sst.aws.ApiGatewayV2("Api", {
      cors: {
        allowOrigins: ["https://app.example.com"],
        allowCredentials: true,
      },
      transform: {
        stage: (args) => {
          args.defaultRouteSettings = {
            throttlingRateLimit: 200,
            throttlingBurstLimit: 400,
          };
        },
      },
    });

    api.route("POST /orders", {
      handler: "src/orders/create.handler",
      link: [table],
      vpc,
    });

    api.route("GET /orders/{id}", {
      handler: "src/orders/get.handler",
      link: [table],
    });

    return { api: api.url };
  },
});
