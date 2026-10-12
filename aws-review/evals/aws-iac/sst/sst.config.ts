/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    const isProd = input?.stage === "production";
    return {
      name: "orders",
      home: "aws",
      version: "3.17.0",
      removal: isProd ? "retain" : "remove",
      protect: isProd,
      providers: {
        aws: { profile: isProd ? "acme-prod" : "acme-dev" },
      },
    };
  },
  async run() {
    const table = new sst.aws.Dynamo("Orders", {
      fields: { pk: "string" },
      primaryIndex: { hashKey: "pk" },
      deletionProtection: $app.stage === "production",
    });

    const api = new sst.aws.ApiGatewayV2("Api");

    api.route("POST /orders", {
      handler: "src/orders.handler",
      link: [table],
    });

    api.route("POST /webhooks/stripe", {
      handler: "src/stripe.handler",
      link: [table],
      environment: {
        STRIPE_KEY: process.env.STRIPE_KEY!,
        PUBLIC_WEBHOOK_URL: `${api.url}/webhooks/stripe`,
      },
    });

    return { api: api.url };
  },
});
