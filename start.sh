#!/bin/bash
# ==============================================================================
# LoreWeaver One-click Startup Script for macOS / Linux
# ==============================================================================

# Text formatting helper
info() { echo -e "\033[1;34m[INFO]\033[0m $1"; }
success() { echo -e "\033[1;32m[SUCCESS]\033[0m $1"; }
warn() { echo -e "\033[1;33m[WARNING]\033[0m $1"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $1"; exit 1; }

echo "======================================================================"
echo "          🧬 LoreWeaver: Multi-Agent GDD & H5 Physics Engine         "
echo "======================================================================"

# 1. Check Node.js Environment
info "Checking Node.js environment..."
if ! command -v node &> /dev/null; then
    error "Node.js is not installed. Please download it fromhttps://nodejs.org/"
fi
NODE_VERSION=$(node -v)
success "Found Node.js $NODE_VERSION"

# 2. Check Python Environment
info "Checking Python environment..."
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    error "Python is not installed. Please download it fromhttps://www.python.org/"
fi
$PYTHON_CMD --version
success "Found Python command: $PYTHON_CMD"

# 3. Handle Environment Variables File
if [ ! -f .env ]; then
    info "Preparing configuration file (.env)..."
    if [ -f .env.example ]; then
        cp .env.example .env
        warn "Created .env from .env.example. Please open .env and add your GEMINI_API_KEY!"
    else
        touch .env
        warn "Created blank .env. Please fill in your GEMINI_API_KEY."
    fi
else
    success "Existing .env file detected."
fi

# 4. Install Node Dependencies
info "Installing frontend and gateway core dependencies..."
npm install
if [ $? -ne 0 ]; then
    error "Failed to install web packages via npm. Clean workspace lockfiles and try again."
fi
success "Web packages installed successfully."

# 5. Install Python Dependencies
info "Installing Python FastAPI & Agent packages..."
VENV_DIR=".venv"
if [ ! -x "$VENV_DIR/bin/python" ]; then
    info "Creating local Python virtual environment at $VENV_DIR ..."
    $PYTHON_CMD -m venv "$VENV_DIR"
    if [ $? -ne 0 ]; then
        error "Failed to create Python virtual environment. Please ensure python3-venv support is installed."
    fi
fi

PYTHON_CMD="$VENV_DIR/bin/python"
export VIRTUAL_ENV="$PWD/$VENV_DIR"
export PATH="$VIRTUAL_ENV/bin:$PATH"
export PIP_CACHE_DIR="$VIRTUAL_ENV/.pip-cache"

$PYTHON_CMD -m ensurepip --upgrade >/dev/null 2>&1
if [ $? -ne 0 ]; then
    warn "Could not refresh bundled pip inside $VENV_DIR; continuing with existing pip."
fi

$PYTHON_CMD -m pip install -r backend/requirements.txt
if [ $? -ne 0 ]; then
    error "Failed to install Python packages into $VENV_DIR. Please check backend/requirements.txt and network access."
fi
success "Python FastAPI & Agent packages installed successfully in $VENV_DIR."

# 6. Check LLM API key status (prefer XAI/Grok, fallback Gemini)
has_xai=0
has_gemini=0
if grep -qE '^(XAI_API_KEY|GROK_API_KEY)=' .env 2>/dev/null; then
    XAI_VAL=$(grep -E '^(XAI_API_KEY|GROK_API_KEY)=' .env | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    if [ -n "$XAI_VAL" ] && [ "$XAI_VAL" != "xai-..." ]; then
        has_xai=1
        success "XAI/Grok API key detected in .env"
    fi
fi
if grep -q '^GEMINI_API_KEY=' .env 2>/dev/null; then
    GEM_VAL=$(grep '^GEMINI_API_KEY=' .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    if [ -n "$GEM_VAL" ] && [ "$GEM_VAL" != "MY_GEMINI_API_KEY" ]; then
        has_gemini=1
        success "Gemini API key detected in .env"
    fi
fi
if [ "$has_xai" -eq 0 ] && [ "$has_gemini" -eq 0 ]; then
    warn "⚠️  No LLM API key configured."
    warn "⚠️  Set XAI_API_KEY (Grok, recommended) or GEMINI_API_KEY in .env"
    warn "⚠️  Without a key, department prep and generation use procedural fallbacks."
fi

# 7. Start dev services
echo "======================================================================"
success "System initialized! Spinning up Express gateway & FastAPI microservice..."
echo "LoreWeaver will be accessible at: http://localhost:3000"
echo "======================================================================"

npm run dev
