import { Duration, Stack, type StackProps } from "aws-cdk-lib";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import type { Construct } from "constructs";

export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const reports = new NodejsFunction(this, "Reports", {
      entry: "src/legacy-report.ts",
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(25),
      bundling: { minify: true, sourceMap: true, format: OutputFormat.ESM },
    });

    reports.addAlias("live", { provisionedConcurrentExecutions: 3 });

    const api = new HttpApi(this, "Api");
    api.addRoutes({
      path: "/reports/{id}",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("ReportsIntegration", reports),
    });
  }
}
