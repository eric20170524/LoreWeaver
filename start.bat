@echo off
:: ==============================================================================
:: LoreWeaver One-click Startup Script for Windows
:: ==============================================================================
title LoreWeaver Launcher

echo ======================================================================
echo           🧬 LoreWeaver: Multi-Agent GDD ^& H5 Physics Engine         
echo ======================================================================

:: 1. Check Node.js Environment
echo [INFO] Checking Node.js environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH. Please install it from https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [SUCCESS] Found Node.js %NODE_VERSION%

:: 2. Check Python Environment
echo [INFO] Checking Python environment...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH. Please install it from https://www.python.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do set PYTHON_VERSION=%%i
echo [SUCCESS] Found %PYTHON_VERSION%

:: 3. Handle Environment Variables File
if not exist .env (
    echo [INFO] Preparing configuration file (.env)...
    if exist .env.example (
        copy .env.example .env >nul
        echo [WARNING] Created .env from .env.example. Please open .env and add your GEMINI_API_KEY!
    ) else (
        echo. > .env
        echo [WARNING] Created empty .env. Please add your GEMINI_API_KEY in it.
    )
) else (
    echo [SUCCESS] Existing .env file detected.
)

:: 4. Install Node Dependencies
echo [INFO] Installing frontend and gateway core dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install web packages via npm.
    pause
    exit /b 1
)
echo [SUCCESS] Web packages installed successfully.

:: 5. Install Python Dependencies
echo [INFO] Installing Python FastAPI ^& Agent packages...
python -m pip install -r backend\requirements.txt
if %errorlevel% neq 0 (
    echo [WARNING] Standard pip check failed, trying simple pip command...
    pip install -r backend\requirements.txt
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install Python packages. Please ensure pip is accessible.
        pause
        exit /b 1
    )
)
echo [SUCCESS] Python FastAPI ^& Agent packages installed successfully.

:: 6. Remind about GEMINI_API_KEY
findstr "GEMINI_API_KEY=." .env >nul 2>&1
if %errorlevel% neq 0 (
    echo ======================================================================
    echo [WARNING] ^^^!GEMINI_API_KEY is empty or missing in your .env file^^^!
    echo [WARNING] Please edit the .env file in the root folder to supply a valid Gemini API Key.
    echo [WARNING] Without this key, sub-agent micro-adjustments and generation will fail.
    echo ======================================================================
)

:: 7. Start dev services
echo ======================================================================
echo [SUCCESS] System initialized! Spinning up Express gateway ^& FastAPI backend...
echo LoreWeaver will be accessible at: http://localhost:3000
echo ======================================================================

call npm run dev
pause
