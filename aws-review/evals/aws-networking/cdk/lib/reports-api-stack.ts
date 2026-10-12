import { Duration, Stack, StackProps } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export interface ReportsApiStackProps extends StackProps {
  userPoolId: string;
  userPoolClientId: string;
}

export class ReportsApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ReportsApiStackProps) {
    super(scope, id, props);

    const authorizerFn = new NodejsFunction(this, "AuthorizerFn", {
      entry: "src/authorizer.ts",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        USER_POOL_ID: props.userPoolId,
        CLIENT_ID: props.userPoolClientId,
      },
    });

    const listReportsFn = new NodejsFunction(this, "ListReportsFn", {
      entry: "src/list-reports.ts",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(10),
    });

    const generateReportFn = new NodejsFunction(this, "GenerateReportFn", {
      entry: "src/generate-report.ts",
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 1024,
      timeout: Duration.minutes(2),
    });

    const authorizer = new apigateway.TokenAuthorizer(this, "TokenAuthorizer", {
      handler: authorizerFn,
    });

    const api = new apigateway.RestApi(this, "ReportsApi", {
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      deployOptions: {
        stageName: "prod",
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultMethodOptions: { authorizer },
    });

    const reports = api.root.addResource("reports");
    reports.addMethod("GET", new apigateway.LambdaIntegration(listReportsFn));
    reports.addMethod("POST", new apigateway.LambdaIntegration(generateReportFn));
  }
}
