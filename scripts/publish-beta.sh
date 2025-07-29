#!/bin/bash

# Beta Publish Script for Promptrun AI SDK
# This script completely bypasses the changeset system for beta releases

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Publishing Beta Release${NC}"

# Get the current version
VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📦 Publishing version: $VERSION${NC}"

# Ensure we're building the latest version
echo -e "${BLUE}🔨 Building package...${NC}"
npm run build

# Run tests
echo -e "${BLUE}🧪 Running tests...${NC}"
npm test

# Temporarily disable changeset configuration
echo -e "${BLUE}🔧 Temporarily disabling changeset configuration...${NC}"
if [ -d ".changeset" ]; then
  mv .changeset .changeset.backup
fi

# Pack the package to ensure correct version
echo -e "${BLUE}📦 Packing package...${NC}"
npm pack

# Publish to NPM with beta tag
echo -e "${BLUE}📤 Publishing to NPM...${NC}"
npm publish --tag beta --access public

# Restore changeset configuration
echo -e "${BLUE}🔧 Restoring changeset configuration...${NC}"
if [ -d ".changeset.backup" ]; then
  mv .changeset.backup .changeset
fi

echo -e "${GREEN}✅ Beta release published successfully!${NC}"
echo -e "${BLUE}🔗 Package available at:${NC}"
echo -e "  ${YELLOW}npm install @promptrun-ai/sdk@beta${NC}" 