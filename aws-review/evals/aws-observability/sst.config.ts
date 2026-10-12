/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "shop-notifications",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    const alerts = new sst.aws.SnsTopic("Alerts");

    const mailer = new sst.aws.Function("Mailer", {
      handler: "src/mailer.handler",
      runtime: "nodejs22.x",
      architecture: "arm64",
      timeout: "20 seconds",
      logging: { format: "json", retention: "forever" },
    });

    for (const metricName of ["Errors", "Throttles"]) {
      new aws.cloudwatch.MetricAlarm(`Mailer${metricName}`, {
        namespace: "AWS/Lambda",
        metricName,
        dimensions: { FunctionName: mailer.name },
        statistic: "Sum",
        period: 60,
        evaluationPeriods: 3,
        threshold: 0,
        comparisonOperator: "GreaterThanThreshold",
        treatMissingData: "notBreaching",
        alarmActions: [alerts.arn],
      });
    }

    return { mailer: mailer.name };
  },
});
