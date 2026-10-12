terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "artifacts_bucket" {
  type = string
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "shop-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# Orders: API -> SQS -> consumer Lambda

resource "aws_sqs_queue" "orders_dlq" {
  name                      = "shop-orders-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "orders" {
  name                       = "shop-orders"
  visibility_timeout_seconds = 30

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_lambda_function" "orders_consumer" {
  function_name = "shop-orders-consumer"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "orders-consumer.handler"
  s3_bucket     = var.artifacts_bucket
  s3_key        = "orders-consumer.zip"
  timeout       = 30
  memory_size   = 512
}

resource "aws_lambda_event_source_mapping" "orders" {
  event_source_arn = aws_sqs_queue.orders.arn
  function_name    = aws_lambda_function.orders_consumer.arn
  batch_size       = 10
}

# Background jobs polled by the Go worker (go/worker)

resource "aws_sqs_queue" "jobs_dlq" {
  name                      = "shop-jobs-dlq"
  message_retention_seconds = 1209600
}

resource "aws_sqs_queue" "jobs" {
  name                       = "shop-jobs"
  visibility_timeout_seconds = 300

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.jobs_dlq.arn
    maxReceiveCount     = 5
  })
}

# Order notifications fan-out

resource "aws_sns_topic" "order_events" {
  name = "shop-order-events"
}

resource "aws_sqs_queue" "notifications" {
  name = "shop-notifications"
}

resource "aws_sns_topic_subscription" "notifications" {
  topic_arn            = aws_sns_topic.order_events.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.notifications.arn
  raw_message_delivery = true
}

# OrderPlaced events -> billing

resource "aws_cloudwatch_event_bus" "orders" {
  name = "shop-orders"
}

resource "aws_cloudwatch_event_rule" "order_placed" {
  name           = "shop-order-placed"
  event_bus_name = aws_cloudwatch_event_bus.orders.name
  event_pattern = jsonencode({
    source        = ["com.shop.orders"]
    "detail-type" = ["OrderPlaced"]
  })
}

resource "aws_lambda_function" "billing" {
  function_name = "shop-billing"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  handler       = "billing.handler"
  s3_bucket     = var.artifacts_bucket
  s3_key        = "billing.zip"
  timeout       = 15
}

resource "aws_cloudwatch_event_target" "billing" {
  rule           = aws_cloudwatch_event_rule.order_placed.name
  event_bus_name = aws_cloudwatch_event_bus.orders.name
  arn            = aws_lambda_function.billing.arn
}

resource "aws_lambda_permission" "billing_from_events" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.billing.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.order_placed.arn
}
