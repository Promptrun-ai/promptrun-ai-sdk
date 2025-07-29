#!/bin/bash

# Beta Release Script for Promptrun AI SDK
# Usage: ./scripts/beta-release.sh [message]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Promptrun AI SDK Beta Release${NC}"

# Check if we're on the beta branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "beta" ]; then
    echo -e "${YELLOW}⚠️  Warning: You're not on the beta branch (current: $CURRENT_BRANCH)${NC}"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Aborted${NC}"
        exit 1
    fi
fi

# Check if there are uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${RED}❌ Error: You have uncommitted changes${NC}"
    git status --short
    exit 1
fi

# Get the current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📦 Current version: $CURRENT_VERSION${NC}"

# Generate clean beta version
if [[ $CURRENT_VERSION =~ -beta\.([0-9]+) ]]; then
  BETA_NUM=$((BASH_REMATCH[1] + 1))
else
  BETA_NUM=1
fi

# Extract base version
BASE_VERSION=$(echo $CURRENT_VERSION | sed 's/-beta\.[0-9]*//')
BETA_VERSION="${BASE_VERSION}-beta.${BETA_NUM}"

echo -e "${BLUE}🎯 Beta version: $BETA_VERSION${NC}"

# Update package.json version
npm version $BETA_VERSION --no-git-tag-version

# Build the package
echo -e "${BLUE}🔨 Building package...${NC}"
npm run build

# Run tests
echo -e "${BLUE}🧪 Running tests...${NC}"
npm test

# Create changeset for beta
echo -e "${BLUE}📝 Creating beta changeset...${NC}"
mkdir -p .changeset
cat > .changeset/beta-${BETA_NUM}.md << EOF
---
"@promptrun-ai/sdk": patch
---

Beta release ${BETA_VERSION}
EOF

# Commit changes
COMMIT_MESSAGE=${1:-"chore: prepare beta release ${BETA_VERSION}"}
git add .
git commit -m "$COMMIT_MESSAGE"

# Create git tag
git tag -a "v${BETA_VERSION}" -m "Beta release ${BETA_VERSION}"

echo -e "${GREEN}✅ Beta release prepared!${NC}"
echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "  1. Push to beta branch: ${YELLOW}git push origin beta${NC}"
echo -e "  2. Push the tag: ${YELLOW}git push origin v${BETA_VERSION}${NC}"
echo -e "  3. The GitHub Action will automatically publish to NPM with the 'beta' tag"
echo -e ""
echo -e "${BLUE}🔗 NPM package will be available at:${NC}"
echo -e "  ${YELLOW}npm install @promptrun-ai/sdk@beta${NC}" 