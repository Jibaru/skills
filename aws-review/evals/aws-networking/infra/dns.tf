data "aws_route53_zone" "main" {
  name = "example.com"
}

resource "aws_route53_record" "apex" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "example.com"
  type    = "A"

  alias {
    name                   = aws_lb.web.dns_name
    zone_id                = aws_lb.web.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "api" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "api.example.com"
  type    = "CNAME"
  ttl     = 300
  records = [aws_lb.web.dns_name]
}

resource "aws_route53_health_check" "status_secondary" {
  ip_address        = "198.51.100.20"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/healthz"
  request_interval  = 30
  failure_threshold = 3
}

resource "aws_route53_record" "status_primary" {
  zone_id        = data.aws_route53_zone.main.zone_id
  name           = "status.example.com"
  type           = "A"
  ttl            = 60
  records        = ["203.0.113.10"]
  set_identifier = "primary"

  failover_routing_policy {
    type = "PRIMARY"
  }
}

resource "aws_route53_record" "status_secondary" {
  zone_id         = data.aws_route53_zone.main.zone_id
  name            = "status.example.com"
  type            = "A"
  ttl             = 60
  records         = ["198.51.100.20"]
  set_identifier  = "secondary"
  health_check_id = aws_route53_health_check.status_secondary.id

  failover_routing_policy {
    type = "SECONDARY"
  }
}
