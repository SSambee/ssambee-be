# Environment Audit Report

This report documents the inconsistencies and issues found in the current development and production environments, along with proposed standardization measures.

## 1. Identified Inconsistencies

### A. Hardcoded Git Branches in Infrastructure (Terraform)
- **File**: `terraform/modules/compute/main.tf`
- **Issue**: The `user_data` script contains `sudo -u ec2-user git pull origin dev`. This means that even in a production environment, the infrastructure might attempt to pull from the `dev` branch by default if not manually overridden, leading to potential code mismatches.
- **Impact**: Environment drift and accidental deployment of development code to production.

### B. Hardcoded Domain Names in Nginx
- **File**: `nginx/conf.d/default.conf`
- **Issue**: The configuration is hardcoded for `api.ssambee.com` and includes specific SSL certificate paths for that domain. There is no provision for a development domain (e.g., `api-dev.ssambee.com`).
- **Impact**: Difficulty in maintaining a separate development environment that mirrors production SSL/TLS behavior.

### C. Manual Blue-Green Deployment Script
- **File**: `deploy.sh`
- **Issue**: The script manually manages container switching, Nginx configuration edits via `sed`, and health checks. This imperative approach is 300+ lines long and prone to failure during edge cases.
- **Impact**: High maintenance overhead and risk of deployment failure or downtime.

### D. GitHub Actions Workflow Lack of Environment Differentiation
- **File**: `.github/workflows/deploy.yml`
- **Issue**: The workflow runs for both `main` and `dev` branches but uses the same set of GitHub Secrets for both. It does not distinguish between `production` and `development` environments at the workflow level (e.g., using GitHub Environments).
- **Impact**: Potential for secret leakage or misconfiguration between environments.

### E. Node.js Version Inconsistency
- **Issue**: `package.json` and `Dockerfile` were using Node.js 24, while the technical requirement was Node.js 22 (LTS).
- **Status**: Fixed in Step 1.

## 2. Proposed Standardization Measures

### A. Docker Swarm Adoption
- Transition from manual Blue-Green to **Docker Swarm Stack** deployment.
- Use declarative `docker-compose.yml` with `deploy` configurations for rolling updates.
- Benefits: Native zero-downtime updates, health-check integration, and automatic rollbacks.

### B. Environment-Specific Stack Overrides
- Implement `docker-compose.dev.yml` and `docker-compose.prod.yml`.
- Use `docker-compose.yml` for common settings.
- Differentiate `replicas`, `resources`, and `update_config` per environment.

### C. Nginx Configuration Templating
- Use Nginx templates with `envsubst` to allow environment variables (like `DOMAIN_NAME`) to be injected at runtime.
- Standardize on service names (e.g., `http://backend:4000`) for upstream communication within the Docker network.

### D. GitHub Environments
- (Recommended) Utilize GitHub Environments and Environment Secrets to separate `development` and `production` configurations clearly.

### E. Config & Secret Management
- Move from purely `.env` files to **Docker Secrets** and **Docker Configs** for sensitive and non-sensitive configuration where appropriate, ensuring they are managed by the orchestration layer.
