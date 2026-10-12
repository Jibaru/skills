/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "shop-growth",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const clicks = new sst.aws.KinesisStream("Clickstream");
    const clickTable = new sst.aws.Dynamo("Clicks", {
      fields: { pk: "string" },
      primaryIndex: { hashKey: "pk" },
    });

    clicks.subscribe(
      "ClickAggregator",
      { handler: "src/clicks.handler", link: [clickTable] },
      {
        transform: {
          eventSourceMapping: (args) => {
            args.functionResponseTypes = ["ReportBatchItemFailures"];
            args.batchSize = 200;
          },
        },
      },
    );

    const signups = new sst.aws.SnsTopic("Signups");
    signups.subscribe("WelcomeEmail", "src/welcome.handler", {
      filter: { eventType: ["signup"] },
    });

    new sst.aws.Function("SignupApi", {
      handler: "src/publish-signup.handler",
      link: [signups],
      url: true,
    });
  },
});
