import { Duration, Stack, StackProps } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";

export interface CheckoutStackProps extends StackProps {
  alertsTopic: sns.ITopic;
  ordersTable: dynamodb.ITableV2;
}

export class CheckoutStack extends Stack {
  constructor(scope: Construct, id: string, props: CheckoutStackProps) {
    super(scope, id, props);

    const logGroup = new logs.LogGroup(this, "CheckoutLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const checkout = new NodejsFunction(this, "Checkout", {
      entry: "src/checkout.ts",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: Duration.seconds(10),
      logGroup,
      loggingFormat: lambda.LoggingFormat.JSON,
      applicationLogLevelV2: lambda.ApplicationLogLevel.INFO,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        TABLE_NAME: props.ordersTable.tableName,
        POWERTOOLS_SERVICE_NAME: "checkout",
        POWERTOOLS_METRICS_NAMESPACE: "Shop",
      },
      bundling: {
        format: OutputFormat.ESM,
        mainFields: ["module", "main"],
        minify: true,
      },
    });
    props.ordersTable.grantReadWriteData(checkout);

    const notify = new cw_actions.SnsAction(props.alertsTopic);

    checkout
      .metricErrors({ period: Duration.minutes(1) })
      .createAlarm(this, "CheckoutErrors", {
        threshold: 0,
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      })
      .addAlarmAction(notify);

    checkout
      .metricThrottles({ period: Duration.minutes(1) })
      .createAlarm(this, "CheckoutThrottles", {
        threshold: 0,
        evaluationPeriods: 5,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      })
      .addAlarmAction(notify);
  }
}
