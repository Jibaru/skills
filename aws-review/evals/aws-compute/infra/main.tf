terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "git_sha" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

resource "aws_s3_bucket" "media" {
  bucket = "acme-media-prod"
}

resource "aws_iam_role" "lambda" {
  name = "acme-lambda"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_lambda_function" "thumbnailer" {
  function_name = "thumbnailer"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs20.x"
  handler       = "thumbnail.handler"
  architectures = ["arm64"]
  memory_size   = 1024
  timeout       = 30
  filename      = "dist/thumbnail.zip"

  environment {
    variables = {
      MEDIA_BUCKET = aws_s3_bucket.media.bucket
    }
  }
}

resource "aws_lambda_permission" "s3_invoke" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.thumbnailer.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.media.arn
}

resource "aws_s3_bucket_notification" "media" {
  bucket = aws_s3_bucket.media.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.thumbnailer.arn
    events              = ["s3:ObjectCreated:*"]
  }

  depends_on = [aws_lambda_permission.s3_invoke]
}

resource "aws_sqs_queue" "thumbnail_failures" {
  name = "thumbnail-failures"
}

resource "aws_lambda_function_event_invoke_config" "thumbnailer" {
  function_name                = aws_lambda_function.thumbnailer.function_name
  maximum_retry_attempts       = 2
  maximum_event_age_in_seconds = 3600

  destination_config {
    on_failure {
      destination = aws_sqs_queue.thumbnail_failures.arn
    }
  }
}

resource "aws_sqs_queue" "orders_dlq" {
  name = "orders-dlq"
}

resource "aws_sqs_queue" "orders" {
  name                       = "orders"
  visibility_timeout_seconds = 30
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.orders_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_lambda_function" "orders" {
  function_name = "orders-consumer"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs24.x"
  handler       = "orders.handler"
  architectures = ["arm64"]
  memory_size   = 512
  timeout       = 25
  filename      = "dist/orders.zip"
}

resource "aws_lambda_event_source_mapping" "orders" {
  event_source_arn = aws_sqs_queue.orders.arn
  function_name    = aws_lambda_function.orders.arn
  batch_size       = 10
}

resource "aws_launch_template" "bastion" {
  name_prefix   = "bastion-"
  image_id      = "ami-0abcdef1234567890"
  instance_type = "t4g.micro"

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "optional"
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = 20
      volume_type = "gp3"
    }
  }
}

resource "aws_ecs_cluster" "main" {
  name = "main"
}

resource "aws_ecs_task_definition" "api" {
  family                   = "api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "api"
    image     = "123456789012.dkr.ecr.us-east-1.amazonaws.com/api:${var.git_sha}"
    essential = true
    portMappings = [{ containerPort = 8080 }]
    healthCheck = {
      command     = ["CMD", "node", "dist/healthcheck.js"]
      interval    = 15
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets = var.private_subnet_ids
  }

  lifecycle {
    ignore_changes = [desired_count]
  }
}

resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = 2
  max_capacity       = 10
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "api-cpu"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
