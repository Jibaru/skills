import { Duration, Stack, StackProps } from "aws-cdk-lib";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";

export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const reserve = new lambda.Function(this, "ReserveStock", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "reserve.handler",
      code: lambda.Code.fromAsset("dist/reserve"),
      memorySize: 512,
      timeout: Duration.seconds(10),
    });

    const workflowLogs = new logs.LogGroup(this, "CheckoutWorkflowLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const checkoutFlow = new sfn.StateMachine(this, "CheckoutFlow", {
      definitionBody: sfn.DefinitionBody.fromChainable(
        new tasks.LambdaInvoke(this, "Reserve", { lambdaFunction: reserve, outputPath: "$.Payload" })
          .next(new sfn.Pass(this, "Price"))
          .next(new sfn.Pass(this, "Tax"))
          .next(new sfn.Pass(this, "Persist"))
          .next(new sfn.Succeed(this, "Done")),
      ),
      timeout: Duration.minutes(1),
      logs: { destination: workflowLogs, level: sfn.LogLevel.ERROR },
    });

    const checkout = new lambda.Function(this, "Checkout", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "checkout.handler",
      code: lambda.Code.fromAsset("dist/checkout"),
      memorySize: 512,
      timeout: Duration.seconds(10),
      environment: {
        CHECKOUT_FLOW_ARN: checkoutFlow.stateMachineArn,
        PAYMENT_SECRET_ID: "prod/payments/api-key",
      },
    });
    checkoutFlow.grantStartExecution(checkout);

    new apigw.LambdaRestApi(this, "CheckoutApi", {
      handler: checkout,
      proxy: true,
    });
  }
}
