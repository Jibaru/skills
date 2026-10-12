import { App, Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { OrdersStack } from '../lib/orders-stack';

const app = new App();

new OrdersStack(app, 'Orders-prod', {
  env: { account: '123456789012', region: 'us-east-1' },
  terminationProtection: true,
  stage: 'prod',
});

Aspects.of(app).add(new AwsSolutionsChecks());
