import { Duration, Stack, StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import { SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";

export class OrdersStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const ordersTable = new dynamodb.TableV2(this, "Orders", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
    });

    // Shipping consumes order events from SNS through its own queue
    const orderEvents = new sns.Topic(this, "OrderEvents");
    const shippingSubDlq = new sqs.Queue(this, "ShippingSubDlq", {
      retentionPeriod: Duration.days(14),
    });
    const shippingDlq = new sqs.Queue(this, "ShippingDlq", {
      retentionPeriod: Duration.days(14),
    });
    const shippingQueue = new sqs.Queue(this, "ShippingQueue", {
      visibilityTimeout: Duration.seconds(180),
      deadLetterQueue: { queue: shippingDlq, maxReceiveCount: 5 },
    });
    orderEvents.addSubscription(
      new SqsSubscription(shippingQueue, {
        rawMessageDelivery: true,
        deadLetterQueue: shippingSubDlq,
      }),
    );

    const shippingConsumer = new nodejs.NodejsFunction(this, "ShippingConsumer", {
      entry: "src/shipping-consumer.ts",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: Duration.seconds(20),
      environment: { ORDERS_TABLE: ordersTable.tableName },
    });
    ordersTable.grantReadWriteData(shippingConsumer);
    shippingConsumer.addEventSource(
      new SqsEventSource(shippingQueue, { batchSize: 10, reportBatchItemFailures: true }),
    );

    // Fulfilment workflow
    const saveOrderFn = new nodejs.NodejsFunction(this, "SaveOrder", {
      entry: "src/save-order.ts",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: Duration.seconds(10),
      environment: { ORDERS_TABLE: ordersTable.tableName },
    });
    ordersTable.grantWriteData(saveOrderFn);

    const warehouseQueue = new sqs.Queue(this, "WarehouseRequests", {
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: { queue: shippingDlq, maxReceiveCount: 5 },
    });

    const saveOrder = new tasks.LambdaInvoke(this, "Save order", {
      lambdaFunction: saveOrderFn,
      payloadResponseOnly: true,
      taskTimeout: sfn.Timeout.duration(Duration.seconds(15)),
    });

    const awaitWarehouse = new tasks.SqsSendMessage(this, "Await warehouse pick", {
      queue: warehouseQueue,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      messageBody: sfn.TaskInput.fromObject({
        orderId: sfn.JsonPath.stringAt("$.orderId"),
        taskToken: sfn.JsonPath.taskToken,
      }),
      taskTimeout: sfn.Timeout.duration(Duration.hours(4)),
      heartbeatTimeout: sfn.Timeout.duration(Duration.minutes(15)),
    });

    new sfn.StateMachine(this, "Fulfilment", {
      stateMachineType: sfn.StateMachineType.EXPRESS,
      definitionBody: sfn.DefinitionBody.fromChainable(saveOrder.next(awaitWarehouse)),
      logs: {
        destination: new logs.LogGroup(this, "FulfilmentLogs", {
          logGroupName: "/aws/vendedlogs/states/fulfilment",
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        level: sfn.LogLevel.ERROR,
      },
    });
  }
}
