# Project Starter

This is the starter template for ElizaOS projects.

## Features

- Pre-configured project structure for ElizaOS development
- Comprehensive testing setup with component and e2e tests
- Default character configuration with plugin integration
- Example service, action, and provider implementations
- TypeScript configuration for optimal developer experience
- Built-in documentation and examples

## Getting Started

```bash
# Create a new project
elizaos create -t project my-project
# Dependencies are automatically installed and built

# Navigate to the project directory
cd my-project

# Start development immediately
elizaos dev
```

## Development

```bash
# Start development with hot-reloading (recommended)
elizaos dev

# OR start without hot-reloading
elizaos start
# Note: When using 'start', you need to rebuild after changes:
# bun run build

# Test the project
elizaos test
```

## Testing

ElizaOS employs a dual testing strategy:

1. **Component Tests** (`src/__tests__/*.test.ts`)

   - Run with Bun's native test runner
   - Fast, isolated tests using mocks
   - Perfect for TDD and component logic

2. **E2E Tests** (`src/__tests__/e2e/*.e2e.ts`)
   - Run with ElizaOS custom test runner
   - Real runtime with actual database (PGLite)
   - Test complete user scenarios

### Test Structure

```
src/
  __tests__/              # All tests live inside src
    *.test.ts            # Component tests (use Bun test runner)
    e2e/                 # E2E tests (use ElizaOS test runner)
      project-starter.e2e.ts  # E2E test suite
      README.md          # E2E testing documentation
  index.ts               # Export tests here: tests: [ProjectStarterTestSuite]
```

### Running Tests

- `elizaos test` - Run all tests (component + e2e)
- `elizaos test component` - Run only component tests
- `elizaos test e2e` - Run only E2E tests

### Writing Tests

Component tests use bun:test:

```typescript
// Unit test example (__tests__/config.test.ts)
describe('Configuration', () => {
  it('should load configuration correctly', () => {
    expect(config.debug).toBeDefined();
  });
});

// Integration test example (__tests__/integration.test.ts)
describe('Integration: Plugin with Character', () => {
  it('should initialize character with plugins', async () => {
    // Test interactions between components
  });
});
```

E2E tests use ElizaOS test interface:

```typescript
// E2E test example (e2e/project.test.ts)
export class ProjectTestSuite implements TestSuite {
  name = 'project_test_suite';
  tests = [
    {
      name: 'project_initialization',
      fn: async (runtime) => {
        // Test project in a real runtime
      },
    },
  ];
}

export default new ProjectTestSuite();
```

The test utilities in `__tests__/utils/` provide helper functions to simplify writing tests.

## Configuration

Customize your project by modifying:

- `src/index.ts` - Main entry point
- `src/character.ts` - Character definition

## PM2 Production Administration

For production deployment, this project includes PM2 configuration for robust process management.

### Quick Start

```bash
# Option 1: Start with ecosystem config (recommended)
pm2 start ecosystem.config.js

# Option 2: Start directly with npm script
pm2 start npm --name pepe-tg -- start

# Option 3: Start with elizaos start command
pm2 start "elizaos start" --name pepe-tg

# Check status
pm2 status

# View logs
pm2 logs pepe-tg

# Restart if needed
pm2 restart pepe-tg
```

### PM2 Commands

#### Basic Operations
```bash
# Start with ecosystem config (recommended - includes health monitoring)
pm2 start ecosystem.config.js

# Alternative: Start directly with npm script
pm2 start npm --name pepe-tg -- start

# Alternative: Start with elizaos start command
pm2 start "elizaos start" --name pepe-tg

# Stop the bot
pm2 stop pepe-tg

# Restart the bot
pm2 restart pepe-tg

# Delete the process
pm2 delete pepe-tg

# Reload configuration
pm2 reload ecosystem.config.js
```

#### Monitoring & Logs
```bash
# View real-time logs
pm2 logs pepe-tg --follow

# View only error logs
pm2 logs pepe-tg --err

# View only output logs
pm2 logs pepe-tg --out

# Monitor CPU/Memory usage
pm2 monit

# Show detailed process info
pm2 show pepe-tg
```

#### Health & Maintenance
```bash
# Check if bot is responsive (look for heartbeat logs)
pm2 logs pepe-tg | grep "HEARTBEAT"

# Force restart if zombie state detected
pm2 restart pepe-tg --force

# Clear old logs
pm2 flush

# Save current PM2 configuration
pm2 save

# Resurrect saved processes on reboot
pm2 startup
```

### Health Monitoring Features

The bot includes built-in health monitoring:

- **💓 Heartbeat**: Logs every 30 seconds to confirm bot is alive
- **🚨 Zombie Detection**: Warns if no activity for 2+ minutes
- **🔄 Auto-restart**: PM2 restarts on crashes or memory limits
- **⏰ Daily Restart**: Automatic restart at 2 AM to prevent memory leaks
- **📊 Memory Limit**: Restarts if memory usage exceeds 1GB

### Troubleshooting

#### Bot Appears Unresponsive
```bash
# Check if heartbeat is still running
pm2 logs pepe-tg | tail -20 | grep "HEARTBEAT"

# If no recent heartbeats, restart
pm2 restart pepe-tg
```

#### Memory Issues
```bash
# Check memory usage
pm2 monit

# Force restart if memory is high
pm2 restart pepe-tg
```

#### Error Logs
```bash
# Check for errors
pm2 logs pepe-tg --err | tail -50

# Look for specific error patterns
pm2 logs pepe-tg | grep -E "(ERROR|UNHANDLED|EXCEPTION)"
```

#### Database Issues
```bash
# Check if database is accessible
ls -la .eliza/.elizadb/

# Restart if database path is wrong
pm2 restart pepe-tg
```

### Environment Variables

Key environment variables for production:

```bash
# Required
TELEGRAM_BOT_TOKEN=your_bot_token
OPENAI_API_KEY=your_openai_key

# Optional
SUPPRESS_BOOTSTRAP=true          # Reduces debug logs
HIDE_LORE_SOURCES=true           # Hides sources in /fl responses
PGLITE_DATABASE_URL=file:///path/to/.elizadb
```

### Production Checklist

- [ ] Bot token configured in `.env`
- [ ] Database properly extracted to `.eliza/.elizadb/`
- [ ] Patches applied (`npx patch-package`)
- [ ] PM2 started with `ecosystem.config.js`
- [ ] Heartbeat logs visible every 30 seconds
- [ ] Bot responds to `/f` and `/fl` commands
- [ ] No unhandled promise rejection errors

### Emergency Procedures

#### Complete Bot Reset
```bash
# Stop everything
pm2 delete all

# Clear logs
pm2 flush

# Restart fresh
pm2 start ecosystem.config.js
```

#### Database Recovery
```bash
# Stop bot
pm2 stop pepe-tg

# Extract database backup
cd .eliza/
tar -xzf elizadb-backup-*.tar.gz

# Restart bot
pm2 start pepe-tg
```
