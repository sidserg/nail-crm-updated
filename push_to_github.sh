#!/bin/bash
# GitHub Push Script for nail-crm-updated
# Requires GitHub Personal Access Token (PAT): export GITHUB_TOKEN="ghp_your_token"

set -e

REPO="sidserg/nail-crm-updated"
API_URL="https://api.github.com/repos/$REPO"

# Check if token is set
if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: GITHUB_TOKEN environment variable is not set!"
    echo "Please set your GitHub Personal Access Token:"
    echo 'export GITHUB_TOKEN="ghp_your_token_here"'
    echo ""
    echo "Alternatively, use SSH git remote instead of HTTPS"
    exit 1
fi

echo "Checking current commit..."
LOCAL_SHA=$(git rev-parse HEAD)

echo "Checking remote commit..."
REMOTE_SHA=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "$API_URL/commits/main" | jq -r '.sha')

echo "Local SHA:  $LOCAL_SHA"
echo "Remote SHA: $REMOTE_SHA"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
    echo "Repository is already up to date. No push needed."
    exit 0
fi

echo "Pushing to GitHub..."
git push origin main

echo "✅ Successfully pushed to $REPO"