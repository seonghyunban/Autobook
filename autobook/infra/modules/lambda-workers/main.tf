# =============================================================================
# LAMBDA WORKERS — the agent worker (container image, SQS-triggered)
# =============================================================================
# Only `agent` runs on Lambda. The normalization worker runs as an ECS
# service, and the old stage-per-Lambda design (precedent, ml_inference,
# resolution, posting, flywheel) has been collapsed — those stages now
# run in-process inside the ECS workers.
#
# The agent worker:
#   1. Is triggered by SQS-agent via an event source mapping (no polling code)
#   2. Runs in VPC private subnets (DB + Redis + Qdrant access)
#   3. Uses a Docker container image from ECR (10GB limit, same image as local dev)

locals {
  name      = "${var.project}-${var.environment}" # e.g. "autobook-dev"
  redis_url = "rediss://${var.redis_endpoint}:${var.redis_port}/0"

  worker_names = []

  # Dockerfile target name for each worker (uses hyphens, not underscores)
  dockerfile_targets = {
    agent = "autobook-agent"
  }

  # Per-worker SQS queue URL environment variables.
  sqs_env = {
    agent = {
      SQS_QUEUE_AGENT      = var.queue_urls["agent"]
      SQS_QUEUE_RESOLUTION = var.queue_urls["resolution"]
      SQS_QUEUE_POSTING    = var.queue_urls["posting"]
    }
  }
}

data "aws_region" "current" {}

# =============================================================================
# ECR REPOSITORIES — Docker image storage for workers
# =============================================================================
resource "aws_ecr_repository" "worker" {
  for_each = toset(local.worker_names)

  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "MUTABLE"

  # Allow `terraform destroy` to wipe the repo even when images are present.
  # Dev-only convenience so retiring a worker doesn't require manual ECR
  # cleanup. For prod you would usually set this false and delete images
  # explicitly before dropping the repo.
  force_delete = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "${local.name}-${each.key}" }
}

resource "aws_ecr_lifecycle_policy" "worker" {
  for_each = toset(local.worker_names)

  repository = aws_ecr_repository.worker[each.key].name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only the 20 most recent images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 20
      }
      action = { type = "expire" }
    }]
  })
}

# =============================================================================
# CLOUDWATCH LOG GROUPS — Lambda stdout/stderr
# =============================================================================
resource "aws_cloudwatch_log_group" "worker" {
  for_each = toset(local.worker_names)

  name              = "/aws/lambda/${local.name}-${each.key}"
  retention_in_days = var.log_retention_days

  tags = { Name = "${local.name}-${each.key}" }
}

# =============================================================================
# LAMBDA FUNCTIONS — container image deployment
# =============================================================================
resource "aws_lambda_function" "worker" {
  for_each = toset(local.worker_names)

  function_name = "${local.name}-${each.key}"
  role          = var.lambda_role_arns[each.key]
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.worker[each.key].repository_url}:latest"
  memory_size   = var.memory_size
  timeout       = var.timeout

  # Override the Dockerfile CMD with the Lambda handler
  image_config {
    command = ["services.${each.key}.aws.handler"]
  }

  # VPC access for DB and Redis
  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.app_sg_id]
  }

  environment {
    variables = merge(
      {
        ENVIRONMENT               = var.environment
        DB_SECRET_ARN             = var.db_credentials_secret_arn
        REDIS_URL                 = local.redis_url
        S3_BUCKET                 = var.s3_bucket_id
        QDRANT_URL                = var.qdrant_url
        QDRANT_API_KEY_SECRET_ARN = var.qdrant_api_key_secret_arn
      },
      local.sqs_env[each.key]
    )
  }

  # CI/CD updates image_uri — don't revert to initial
  lifecycle {
    ignore_changes = [image_uri]
  }

  depends_on = [aws_cloudwatch_log_group.worker]

  tags = { Name = "${local.name}-${each.key}" }
}

# =============================================================================
# SQS EVENT SOURCE MAPPINGS — trigger Lambda from queue
# =============================================================================
resource "aws_lambda_event_source_mapping" "worker" {
  for_each = toset(local.worker_names)

  event_source_arn = var.queue_arns[each.key]
  function_name    = aws_lambda_function.worker[each.key].arn
  batch_size       = var.sqs_batch_size
  enabled          = true
}
