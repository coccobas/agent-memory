#!/bin/bash

# Agent Memory - Development Setup Script
# This script sets up the development environment in one command

set -e  # Exit on error

echo "🚀 Agent Memory - Development Setup"
echo "===================================="
echo ""

# Check Node.js version
echo "📋 Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js >= 20.0.0"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js version must be >= 20.0.0 (found: $(node -v))"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi

echo "✅ npm $(npm -v) detected"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Build the project
echo "🔨 Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"
echo ""

# Create data directory if it doesn't exist
if [ ! -d "data" ]; then
    echo "📁 Creating data directory..."
    mkdir -p data
    echo "✅ Data directory created"
    echo ""
fi

# Run tests
echo "🧪 Running tests..."
npm run test:run

if [ $? -ne 0 ]; then
    echo "⚠️  Some tests failed, but continuing setup..."
else
    echo "✅ All tests passed"
fi

echo ""

# Check code quality
echo "🔍 Checking code quality..."

echo "  - Running linter..."
npm run lint

if [ $? -ne 0 ]; then
    echo "⚠️  Linting issues found (run 'npm run lint:fix' to auto-fix)"
else
    echo "  ✅ Linting passed"
fi

echo "  - Running type checker..."
npm run typecheck

if [ $? -ne 0 ]; then
    echo "⚠️  Type checking issues found"
else
    echo "  ✅ Type checking passed"
fi

echo ""

# Success message
echo "✨ Development setup complete!"
echo ""
echo "Next steps:"
echo "  • Start development: npm run dev"
echo "  • Run tests: npm test"
echo "  • Open database studio: npm run db:studio"
echo "  • Read the docs: docs/development.md"
echo ""
echo "Useful commands:"
echo "  • npm run validate - Run all checks"
echo "  • npm run format - Format code"
echo "  • npm run db:backup - Backup database"
echo ""
echo "Happy coding! 🎉"
