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
$PYTHON_CMD -m pip install -r backend/requirements.txt
if [ $? -ne 0 ]; then
    warn "Direct pip install failed. Attempting with local flags..."
    pip install -r backend/requirements.txt
    if [ $? -ne 0 ]; then
        error "Failed to install Python packages. Please ensure pip is installed."
    fi
fi
success "Python FastAPI & Agent packages installed successfully."

# 6. Check GEMINI_API_KEY status
if grep -q "GEMINI_API_KEY=" .env; then
    KEY_VAL=$(grep "GEMINI_API_KEY=" .env | cut -d'=' -f2)
    if [ -z "$KEY_VAL" ]; then
        warn "⚠️  GEMINI_API_KEY is currently EMPTY in your .env file."
        warn "⚠️  Please edit the .env file in the root folder to supply a valid Gemini API Key."
        warn "⚠️  Without this, sub-agent micro-adjustments and generative steps will throw 502/Failed exceptions."
    fi
else
    warn "⚠️  GEMINI_API_KEY is missing from .env!"
fi

# 7. Start dev services
echo "======================================================================"
success "System initialized! Spinning up Express gateway & FastAPI microservice..."
echo "LoreWeaver will be accessible at: http://localhost:3000"
echo "======================================================================"

npm run dev
