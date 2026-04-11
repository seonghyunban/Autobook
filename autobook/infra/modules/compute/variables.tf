# =============================================================================
# REQUIRED INPUTS — from other modules, caller must provide all of these
# =============================================================================

# --- Naming ---

variable "project" {
  type        = string
  description = "Project name, used in resource naming"
}

variable "environment" {
  type        = string
  description = "Deployment environment, used in resource naming"
}

# --- From networking module ---

# ALB goes in public subnets (needs to receive internet traffic)
variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnet IDs — ALB is placed here"
}

# ECS services go in private subnets (no direct internet access, use NAT for outbound)
variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs — ECS tasks run here"
}

# Firewall for the ALB — allows HTTPS from the internet
variable "alb_sg_id" {
  type        = string
  description = "Security group for the ALB (allows HTTPS from internet)"
}

# Firewall for ECS services — only allows traffic from the ALB
variable "app_sg_id" {
  type        = string
  description = "Security group for ECS services (allows traffic from ALB only)"
}

# Needed by ALB target group to know which VPC it belongs to
variable "vpc_id" {
  type        = string
  description = "VPC ID from networking module"
}

# --- From IAM module ---

# Lets the ECS agent pull images, write logs, read secrets
variable "execution_role_arn" {
  type        = string
  description = "ECS execution role ARN (image pull, logs, secrets)"
}

# After Lambda migration, this only contains {"api" = "arn:..."}
variable "task_role_arns" {
  type        = map(string)
  description = "Map of ECS service name → task role ARN from IAM module (API only)"
}

# --- From global stack ---

# TLS certificate for HTTPS — attached to the ALB listener
variable "cert_arn" {
  type        = string
  description = "ACM certificate ARN for HTTPS (from global stack)"
}

# --- From cache module ---

variable "redis_endpoint" {
  type        = string
  description = "Redis primary endpoint hostname"
  default     = "localhost"
}

variable "redis_port" {
  type        = number
  description = "Redis port number"
  default     = 6379
}

# --- From storage module ---

variable "s3_bucket_id" {
  type        = string
  description = "S3 bucket name — passed as env var to containers"
}

# --- From secrets module ---

# ECS reads individual fields from this JSON secret at container startup:
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
variable "db_credentials_secret_arn" {
  type        = string
  description = "Secrets Manager ARN for DB credentials JSON"
}

# --- From vector-search module ---

# Plain text — same in every environment, safe to put in env block
variable "qdrant_url" {
  type        = string
  description = "Qdrant Cloud cluster URL — injected as QDRANT_URL env var"
}

# Secrets Manager ARN — referenced in the task definition's `secrets`
# block so the ECS agent fetches and injects the value at task start.
variable "qdrant_api_key_secret_arn" {
  type        = string
  description = "Secrets Manager ARN for the Qdrant API key — injected as QDRANT_API_KEY"
}

# --- From auth module ---

# Only the API service needs these — used to validate user auth tokens
variable "user_pool_id" {
  type        = string
  description = "Cognito user pool ID (API service uses for auth validation)"
}

variable "client_id" {
  type        = string
  description = "Cognito app client ID (passed to frontend config)"
}

variable "cognito_domain" {
  type        = string
  description = "Cognito hosted UI domain (API service uses for OAuth token exchange)"
}

# --- From queuing module ---

# API only needs the normalization queue URL to enqueue uploaded files.
# Workers get their queue URLs from the lambda-workers module.
variable "queue_urls" {
  type        = map(string)
  description = "Map of SQS queue name → URL from queuing module"
}

# =============================================================================
# OPTIONAL INPUTS — safe defaults provided
# =============================================================================

# Port the API container listens on — must match the application's port
variable "container_port" {
  type        = number
  description = "Port the API container listens on (must match app config)"
  default     = 8000
}

# Fargate CPU allocation — 256 = 0.25 vCPU (smallest Fargate size)
# Valid values: 256, 512, 1024, 2048, 4096
# Same value for all 8 services — this is the BOOTSTRAP default only.
# CI/CD creates per-service task definition revisions with appropriate sizing.
# lifecycle { ignore_changes = [task_definition] } prevents Terraform from reverting.
variable "cpu" {
  type        = number
  description = "CPU units per task (1024 = 1 vCPU)"
  default     = 1024
}

variable "memory" {
  type        = number
  description = "Memory in MB per task"
  default     = 2048
}

# How many copies of each service to run
# 0 = infrastructure exists but no containers are running (CI/CD deploys first)
variable "desired_count" {
  type        = number
  description = "Number of tasks per service (0 = no running containers until CI/CD deploys)"
  default     = 0
}

# How many days to keep container logs in CloudWatch
variable "log_retention_days" {
  type        = number
  description = "Days to keep container logs in CloudWatch"
  default     = 30
}

# URL path the ALB uses to check if the API service is healthy
variable "health_check_path" {
  type        = string
  description = "Health check endpoint for the API service"
  default     = "/health"
}
