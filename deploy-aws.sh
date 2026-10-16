#!/bin/bash

# AWS Deployment Script for Capabble Server
# This script helps automate the deployment process to AWS Elastic Beanstalk

set -e

echo "🚀 Capabble Server AWS Deployment Script"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if EB CLI is installed
if ! command -v eb &> /dev/null; then
    echo -e "${RED}❌ EB CLI is not installed${NC}"
    echo "Install it with: brew install awsebcli (macOS) or pip install awsebcli"
    exit 1
fi

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not configured${NC}"
    echo "Run: aws configure"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Navigate to server directory
cd "$(dirname "$0")"

# Check if .ebextensions exists
if [ ! -d ".ebextensions" ]; then
    echo -e "${YELLOW}⚠️  .ebextensions directory not found. Creating...${NC}"
    mkdir -p .ebextensions
fi

# Check if initialized
if [ ! -f ".elasticbeanstalk/config.yml" ]; then
    echo -e "${YELLOW}⚠️  Elastic Beanstalk not initialized${NC}"
    echo "Run: eb init"
    exit 1
fi

# Get environment name
read -p "Enter environment name (default: capabble-server-prod): " ENV_NAME
ENV_NAME=${ENV_NAME:-capabble-server-prod}

# Check if environment exists
if eb list | grep -q "$ENV_NAME"; then
    echo -e "${GREEN}📦 Deploying to existing environment: $ENV_NAME${NC}"
    eb deploy "$ENV_NAME"
else
    echo -e "${YELLOW}⚠️  Environment $ENV_NAME does not exist${NC}"
    read -p "Create new environment? (y/n): " CREATE_ENV
    if [ "$CREATE_ENV" = "y" ]; then
        echo -e "${GREEN}📦 Creating new environment: $ENV_NAME${NC}"
        eb create "$ENV_NAME"
    else
        echo "Exiting..."
        exit 0
    fi
fi

echo ""
echo -e "${GREEN}✅ Deployment initiated!${NC}"
echo ""
echo "Next steps:"
echo "1. Set environment variables: eb setenv KEY=value"
echo "2. View logs: eb logs"
echo "3. Check status: eb status"
echo "4. Open in browser: eb open"
echo ""
echo "Required environment variables:"
echo "  - MONGODB_URI"
echo "  - JWT_SECRET"
echo "  - JWT_REFRESH_SECRET"
echo "  - CLIENT_URL"
echo "  - CLOUDINARY_CLOUD_NAME"
echo "  - CLOUDINARY_API_KEY"
echo "  - CLOUDINARY_API_SECRET"
echo ""
echo "See AWS_DEPLOYMENT.md for detailed instructions."
