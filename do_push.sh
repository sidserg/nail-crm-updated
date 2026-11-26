#!/bin/bash
# Push to GitHub using HTTPS token
# Run: GITHUB_TOKEN=ghp_your_token_here ./do_push.sh

REPO="sidserg/nail-crm-updated"

if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: Set GITHUB_TOKEN environment variable"
    echo "Example: export GITHUB_TOKEN=ghp_your_token_here"
    echo "Then run: git push https://\$GITHUB_TOKEN@github.com/$REPO.git main"
    exit 1
fi

echo "Pushing to $REPO..."
git push "https://$GITHUB_TOKEN@github.com/$REPO.git" main

if [ $? -eq 0 ]; then
    echo "✅ Successfully pushed!"
else
    echo "❌ Push failed"
    exit 1
fi