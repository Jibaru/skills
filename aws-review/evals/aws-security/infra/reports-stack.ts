import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class ReportsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new dynamodb.TableV2(this, 'Reports', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
    });

    const partnerSecret = secretsmanager.Secret.fromSecretNameV2(this, 'PartnerApi', 'reports/partner-api');

    const exportFn = new lambda.Function(this, 'Export', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'export.handler',
      code: lambda.Code.fromAsset('dist/export'),
      timeout: Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        PARTNER_API_KEY: partnerSecret.secretValueFromJson('apiKey').unsafeUnwrap(),
      },
    });

    table.grantReadData(exportFn);

    exportFn.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });
  }
}
