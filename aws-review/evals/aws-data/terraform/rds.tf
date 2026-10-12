resource "aws_db_parameter_group" "reports" {
  name   = "reports-mysql80"
  family = "mysql8.0"

  parameter {
    name  = "require_secure_transport"
    value = "1"
  }
}

resource "aws_db_instance" "reports" {
  identifier     = "reports-prod"
  engine         = "mysql"
  engine_version = "8.0.40"
  instance_class = "db.r8g.large"

  allocated_storage     = 100
  max_allocated_storage = 500
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name                     = "reports"
  username                    = "admin"
  manage_master_user_password = true

  multi_az                = true
  publicly_accessible     = false
  db_subnet_group_name    = var.db_subnet_group_name
  vpc_security_group_ids  = [var.db_security_group_id]
  parameter_group_name    = aws_db_parameter_group.reports.name
  backup_retention_period = 0

  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "reports-prod-final"

  iam_database_authentication_enabled = true
}

resource "aws_db_proxy" "reports" {
  name                   = "reports-proxy"
  engine_family          = "MYSQL"
  role_arn               = var.proxy_role_arn
  vpc_subnet_ids         = var.private_subnet_ids
  vpc_security_group_ids = [var.proxy_security_group_id]
  require_tls            = true

  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "REQUIRED"
    secret_arn  = aws_db_instance.reports.master_user_secret[0].secret_arn
  }
}

resource "aws_db_proxy_default_target_group" "reports" {
  db_proxy_name = aws_db_proxy.reports.name

  connection_pool_config {
    max_connections_percent = 80
  }
}

resource "aws_db_proxy_target" "reports" {
  db_proxy_name          = aws_db_proxy.reports.name
  target_group_name      = aws_db_proxy_default_target_group.reports.name
  db_instance_identifier = aws_db_instance.reports.identifier
}

output "reports_proxy_endpoint" {
  value = aws_db_proxy.reports.endpoint
}
