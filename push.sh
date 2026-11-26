#!/bin/bash
# Push script with embedded credentials
# IMPORTANT: Replace with your actual token before running!

REPO="sidserg/nail-crm-updated"
TOKEN="${GITHUB_TOKEN:-ghp_your_token_here}"

if [ "$TOKEN" = "ghp_your_token_here" ]; then
    echo "Error: Please set GITHUB_TOKEN environment variable or edit this script"
    echo "Example: export GITHUB_TOKEN=ghp_your_github_token"
    exit 1
fi

echo "Pushing changes to $REPO..."
git push "https://$TOKEN@github.com/$REPO.git" main

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed!"
else
    echo "❌ Push failed"
    exit 1
fi