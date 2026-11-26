@echo off
set TOKEN=ghp_your_token_here
set REPO=sidserg/nail-crm-updated

echo ⚠️  Обязательно замените ghp_your_token_here на реальный токен!
echo Пример: set TOKEN=ghp_abc123...
echo.

echo Делаем пуш...
set GITHUB_TOKEN=%TOKEN%
git push "https://%TOKEN%@github.com/%REPO%.git" main

if %ERRORLEVEL% EQU 0 (
    echo ✅ Готово!
) else (
    echo ❌ Ошибка пуша
)