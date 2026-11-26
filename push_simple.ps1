@{
    $token = Read-Host "Enter GitHub Token (ghp_...)"
    $repo = "sidserg/nail-crm-updated"
    Write-Host "Pushing to $repo..."
    git push "https://$token@github.com/$repo.git" main
    if ($LASTEXITCODE -eq 0) {
        Write-Host "? Successfully pushed!"
    } else {
        Write-Host "? Push failed"
    }
}
