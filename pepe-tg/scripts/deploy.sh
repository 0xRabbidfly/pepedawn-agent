#!/bin/bash

# PEPEDAWN Bot Deployment Script
# Automates SSH deployment to DigitalOcean server

set -e  # Exit on any error

# Configuration
SERVER_IP="134.122.45.20"
SSH_KEY="~/.ssh/pepedawn"
PROJECT_DIR="pepedawn-agent/pepe-tg"
PM2_CONFIG="ecosystem.config.cjs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] ✅${NC} $1"
}

warning() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ❌${NC} $1"
}

# Function to execute SSH commands with retries
ssh_exec() {
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log "SSH attempt $attempt/$max_attempts..."
        
        if ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@"$SERVER_IP" "$1"; then
            return 0
        else
            if [ $attempt -eq $max_attempts ]; then
                error "SSH command failed after $max_attempts attempts"
                return 1
            fi
            warning "SSH attempt $attempt failed, retrying in 5 seconds..."
            sleep 5
            ((attempt++))
        fi
    done
}

# Main deployment function
deploy() {
    log "🚀 Starting PEPEDAWN bot deployment..."
    
    # Step 1: SSH into server
    log "Step 1: Connecting to server $SERVER_IP..."
    if ! ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@"$SERVER_IP" "echo 'Connected successfully'"; then
        error "Failed to connect to server"
        exit 1
    fi
    success "Connected to server"
    
    # Step 2: Navigate to project directory
    log "Step 2: Navigating to project directory..."
    ssh_exec "cd $PROJECT_DIR && pwd"
    success "Navigated to project directory"
    
    # Step 3: Check git status
    log "Step 3: Checking git status..."
    ssh_exec "cd $PROJECT_DIR && git status"
    success "Git status checked"
    
    # Step 4: Pull latest changes
    log "Step 4: Pulling latest changes..."
    ssh_exec "cd $PROJECT_DIR && git pull"
    success "Latest changes pulled"
    
    # Step 5: Install dependencies (if needed)
    log "Step 5: Installing dependencies..."
    ssh_exec "cd $PROJECT_DIR && bun install"
    success "Dependencies installed"
    
    # Step 6: Build TypeScript project
    log "Step 6: Building TypeScript project..."
    ssh_exec "cd $PROJECT_DIR && bun run build"
    success "Project built successfully"
    
    # Step 7: Restart PM2
    if [ "$NUCLEAR_MODE" = true ]; then
        log "Step 7: NUCLEAR RESTART - Killing PM2 daemon and all processes..."
        ssh_exec "cd $PROJECT_DIR && pm2 delete pepe-tg || true"
        ssh_exec "cd $PROJECT_DIR && pm2 kill"
        ssh_exec "sleep 3"
        ssh_exec "lsof -ti:3000 | xargs kill -9 2>/dev/null || true"
        ssh_exec "pkill -f 'elizaos' || true"
        ssh_exec "sleep 2"
        success "Nuclear cleanup complete"
        
        log "Step 7b: Starting PM2 fresh..."
        ssh_exec "cd $PROJECT_DIR && pm2 start $PM2_CONFIG"
        ssh_exec "cd $PROJECT_DIR && pm2 save"
        success "PM2 restarted (NUCLEAR mode)"
    else
        log "Step 7: Hard restart PM2 process..."
        ssh_exec "cd $PROJECT_DIR && pm2 stop pepe-tg || true"
        
        log "Step 7b: Deleting PM2 process..."
        ssh_exec "cd $PROJECT_DIR && pm2 delete pepe-tg || true"
        
        log "Step 7c: Starting PM2 with new build..."
        ssh_exec "cd $PROJECT_DIR && pm2 start $PM2_CONFIG"
        
        log "Step 7d: Saving PM2 state..."
        ssh_exec "cd $PROJECT_DIR && pm2 save"
        success "PM2 restarted (hard restart)"
    fi
    
    # Step 8: Check PM2 status
    log "Step 8: Checking PM2 status..."
    ssh_exec "cd $PROJECT_DIR && pm2 status"
    success "PM2 status checked"
    
    # Step 9: Show recent logs
    log "Step 9: Showing recent logs..."
    ssh_exec "cd $PROJECT_DIR && pm2 logs --lines 10"
    
    success "🎉 Deployment completed successfully!"
}

# Function to show help
show_help() {
    echo "PEPEDAWN Bot Deployment Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help      Show this help message"
    echo "  -d, --dry-run   Show what would be executed without running"
    echo "  -n, --nuclear   Use nuclear restart (pm2 kill + process cleanup)"
    echo ""
    echo "Configuration:"
    echo "  Server IP: $SERVER_IP"
    echo "  SSH Key: $SSH_KEY"
    echo "  Project Dir: $PROJECT_DIR"
    echo "  PM2 Config: $PM2_CONFIG"
}

# Function for dry run
dry_run() {
    log "🔍 DRY RUN - Commands that would be executed:"
    echo ""
    echo "1. ssh -i $SSH_KEY root@$SERVER_IP 'echo Connected successfully'"
    echo "2. ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && pwd'"
    echo "3. ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && git status'"
    echo "4. ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && git pull'"
    echo "5. ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && bun install'"
    echo "6. ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && bun run build'"
    if [ "$NUCLEAR_MODE" = true ]; then
        echo "7. [NUCLEAR] ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && pm2 delete pepe-tg || true'"
        echo "7a. [NUCLEAR] ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && pm2 kill'"
        echo "7b. [NUCLEAR] ssh -i $SSH_KEY root@$SERVER_IP 'sleep 3 && lsof -ti:3000 | xargs kill -9'"
        echo "7c. [NUCLEAR] ssh -i $SSH_KEY root@$SERVER_IP 'pkill -f elizaos'"
        echo "7d. [NUCLEAR] ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && pm2 start $PM2_CONFIG'"
        echo "7e. [NUCLEAR] ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && pm2 save'"
    else
        echo "7a. ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && pm2 stop pepe-tg'"
        echo "7b. ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && pm2 delete pepe-tg'"
        echo "7c. ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && pm2 start $PM2_CONFIG'"
        echo "7d. ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && pm2 save'"
    fi
    echo "8. ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && pm2 status'"
    echo "9. ssh -i $SSH_KEY root@$SERVER_IP 'cd $PROJECT_DIR && pm2 logs --lines 10'"
}

# Parse command line arguments
NUCLEAR_MODE=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -n|--nuclear)
            NUCLEAR_MODE=true
            shift
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
if [ "$DRY_RUN" = true ]; then
    dry_run
else
    deploy
fi
