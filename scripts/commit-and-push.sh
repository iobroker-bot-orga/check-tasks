#!/usr/bin/env bash
# Script to commit and push changes with retry logic to handle concurrent commits
# This replaces mikeal/publish-to-github-action with better race condition handling
# Note: We don't use 'set -e' here because we need to handle errors for retry logic

# Check required environment variables
if [ -z "${GITHUB_TOKEN}" ]; then
    echo "Error: GITHUB_TOKEN environment variable is required"
    exit 1
fi

if [ -z "${BRANCH_NAME}" ]; then
    export BRANCH_NAME=main
fi

# Configure git
git config --global user.name "Automated Publisher"
git config --global user.email "actions@users.noreply.github.com"

# Maximum number of retry attempts
MAX_RETRIES=5
RETRY_COUNT=0
RETRY_DELAY=2

echo "Starting commit and push process for branch: ${BRANCH_NAME}"

# Check if there are any changes to commit
if git diff --quiet && git diff --cached --quiet; then
    echo "No changes to commit, exiting successfully"
    exit 0
fi

# Stage all changes
git add -A

# Check again after staging
if git diff --cached --quiet; then
    echo "No changes to commit after staging, exiting successfully"
    exit 0
fi

# Commit changes locally first
timestamp=$(date -u)
git commit -m "Automated publish: ${timestamp} ${GITHUB_SHA}" || {
    echo "Nothing to commit"
    exit 0
}

while [ ${RETRY_COUNT} -lt ${MAX_RETRIES} ]; do
    echo "Attempt $((RETRY_COUNT + 1)) of ${MAX_RETRIES}"
    
    # Pull the latest changes with rebase
    echo "Pulling latest changes..."
    if ! git pull --rebase origin "${BRANCH_NAME}"; then
        echo "Warning: Pull with rebase failed, will retry..."
        RETRY_COUNT=$((RETRY_COUNT + 1))
        sleep $((RETRY_DELAY * RETRY_COUNT))
        continue
    fi
    
    # Try to push
    echo "Pushing to origin/${BRANCH_NAME}..."
    if git push origin "${BRANCH_NAME}"; then
        echo "Successfully pushed changes"
        exit 0
    else
        echo "Push failed, likely due to concurrent updates. Retrying..."
        RETRY_COUNT=$((RETRY_COUNT + 1))
        # Exponential backoff
        sleep $((RETRY_DELAY * RETRY_COUNT))
    fi
done

echo "Error: Failed to push changes after ${MAX_RETRIES} attempts"
exit 1
