variable "region" {
  type = string
}

variable "account_id" {
  type = string
}

variable "env" {
  type = string
}

variable "queue_names" {
  type    = list(string)
  default = ["order-created", "order-paid", "order-shipped"]
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "cluster_arn" {
  type = string
}

variable "bootstrap_task_definition_arn" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "vpc_cidr" {
  type = string
}

variable "alb_security_group_id" {
  type = string
}
