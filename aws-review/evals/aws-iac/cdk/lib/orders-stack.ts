import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export interface OrdersStackProps extends StackProps {
  stage: string;
}

export class OrdersStack extends Stack {
  constructor(scope: Construct, id: string, props: OrdersStackProps) {
    super(scope, id, props);

    const table = new dynamodb.TableV2(this, 'Orders', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const stripe = secretsmanager.Secret.fromSecretNameV2(this, 'Stripe', `${props.stage}/stripe`);

    const logGroup = new logs.LogGroup(this, 'CheckoutLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const checkout = new NodejsFunction(this, 'Checkout', {
      entry: 'src/checkout.ts',
      logGroup,
      environment: {
        ORDERS_TABLE: table.tableName,
        STRIPE_KEY: stripe.secretValue.unsafeUnwrap(),
      },
    });

    table.grantReadWriteData(checkout);
  }
}
