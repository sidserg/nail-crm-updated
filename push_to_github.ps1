# GitHub Push Script for nail-crm-updated
# Requires GitHub Personal Access Token (PAT) to be set in $env:GITHUB_TOKEN

param(
    [string]$Message = "fix: today cell border styling bug"
)

# Check if token is set
if (-not $env:GITHUB_TOKEN) {
    Write-Error "GITHUB_TOKEN environment variable is not set!"
    Write-Host "Please set your GitHub Personal Access Token:"
    Write-Host '$env:GITHUB_TOKEN = "ghp_your_token_here"'
    Write-Host ""
    Write-Host "Alternatively, use SSH git remote instead of HTTPS"
    exit 1
}

$Repo = "sidserg/nail-crm-updated"
$ApiUrl = "https://api.github.com/repos/$Repo"

Write-Host "Getting current commit SHA..."
$CommitSha = git rev-parse HEAD

Write-Host "Getting latest commit on remote..."
try {
    $RemoteRef = Invoke-RestMethod -Uri "$ApiUrl/commits/main" -Headers @{ Authorization = "token $env:GITHUB_TOKEN" }
    $RemoteSha = $RemoteRef.sha
    Write-Host "Remote SHA: $RemoteSha"
    Write-Host "Local SHA:  $CommitSha"
} catch {
    Write-Error "Failed to get remote commit: $_"
    exit 1
}

if ($CommitSha -eq $RemoteSha) {
    Write-Host "Repository is already up to date. No push needed."
    exit 0
}

Write-Host "Pushing to GitHub..."
try {
    git push origin main
    Write-Host "✅ Successfully pushed to $Repo"
} catch {
    Write-Error "Failed to push: $_"
    
    Write-Host ""
    Write-Host "Alternative: Use SSH remote"
    Write-Host "Run: git remote set-url origin git@github.com:sidserg/nail-crm-updated.git"
    Write-Host "Then: git push origin main"
    exit 1
}