@echo off
cd /d "%~dp0"
echo 패키지 설치 중...
call npm install
if %errorlevel% neq 0 (
  echo.
  echo [실패] npm install 이 실패했습니다. Node.js가 설치되어 있는지 확인하세요.
  pause
  exit /b 1
)
echo.
echo 완료. .env.example 을 복사해 .env 로 이름을 바꾸고 값을 채운 뒤 run_sync.bat 로 테스트하세요.
pause
