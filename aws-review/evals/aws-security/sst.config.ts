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
    const stripeKey = new sst.Secret("StripeKey");
    const orders = new sst.aws.Dynamo("Orders", {
      fields: { pk: "string" },
      primaryIndex: { hashKey: "pk" },
    });

    const api = new sst.aws.ApiGatewayV2("Api");
    const jwt = api.addAuthorizer({
      name: "jwt",
      jwt: { issuer: "https://auth.acme.dev/", audiences: ["orders-api"] },
    });

    api.route(
      "GET /orders/{id}",
      { handler: "src/handler.getOrder", link: [orders] },
      { auth: { jwt: { authorizer: jwt.id } } },
    );
    api.route("POST /admin/refunds", { handler: "src/handler.refund", link: [orders, stripeKey] });

    return { api: api.url };
  },
});
