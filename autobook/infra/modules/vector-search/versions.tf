terraform {
  required_providers {
    qdrant-cloud = {
      source  = "qdrant/qdrant-cloud"
      version = ">= 1.1.0"
    }
    # AWS provider is required for the Secrets Manager mirror of the
    # Qdrant API key — Terraform reads the key from the qdrant-cloud
    # resource and writes it into Secrets Manager so ECS and Lambda can
    # read it at startup via the standard AWS secret-injection paths.
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}
