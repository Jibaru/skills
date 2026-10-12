/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "acme-billing",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const invoices = new sst.aws.Dynamo("Invoices", {
      fields: { pk: "string" },
      primaryIndex: { hashKey: "pk" },
    });

    const dlq = new sst.aws.Queue("InvoiceEventsDlq");

    const events = new sst.aws.Queue("InvoiceEvents", {
      visibilityTimeout: "3 minutes",
      dlq: { queue: dlq.arn, retry: 5 },
    });

    events.subscribe(
      {
        handler: "functions/invoice-events.handler",
        architecture: "arm64",
        memory: "512 MB",
        timeout: "25 seconds",
        link: [invoices],
      },
      { batch: { size: 10, window: "20 seconds", partialResponses: true } },
    );
  },
});
