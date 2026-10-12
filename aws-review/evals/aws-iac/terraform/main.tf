provider "aws" {
  region              = var.region
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      Environment = var.env
      Service     = "orders"
    }
  }
}

resource "aws_dynamodb_table" "orders" {
  name                        = "orders-${var.env}"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "pk"
  deletion_protection_enabled = true

  attribute {
    name = "pk"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sqs_queue" "events" {
  count = length(var.queue_names)
  name  = "${var.queue_names[count.index]}-${var.env}"
}

resource "aws_iam_role" "worker" {
  name               = "orders-worker-${var.env}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

data "archive_file" "worker" {
  type        = "zip"
  source_file = "${path.module}/../build/bootstrap"
  output_path = "${path.module}/../build/worker.zip"
}

resource "aws_lambda_function" "worker" {
  function_name = "orders-worker-${var.env}"
  role          = aws_iam_role.worker.arn
  filename      = data.archive_file.worker.output_path
  runtime       = "provided.al2023"
  handler       = "bootstrap"
  architectures = ["arm64"]

  environment {
    variables = {
      ORDERS_TABLE = aws_dynamodb_table.orders.name
    }
  }
}

resource "aws_db_instance" "reporting" {
  identifier                = "orders-reporting-${var.env}"
  engine                    = "postgres"
  instance_class            = "db.t4g.medium"
  allocated_storage         = 50
  username                  = "reporting"
  password                  = var.db_password
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "orders-reporting-${var.env}-final"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecs_service" "api" {
  name            = "orders-api"
  cluster         = var.cluster_arn
  task_definition = var.bootstrap_task_definition_arn
  desired_count   = 2

  lifecycle {
    ignore_changes = [task_definition]
  }
}

resource "aws_security_group" "api" {
  name   = "orders-api-${var.env}"
  vpc_id = var.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
}

resource "aws_vpc_security_group_ingress_rule" "api_from_alb" {
  security_group_id            = aws_security_group.api.id
  referenced_security_group_id = var.alb_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 8080
  to_port                      = 8080
}
