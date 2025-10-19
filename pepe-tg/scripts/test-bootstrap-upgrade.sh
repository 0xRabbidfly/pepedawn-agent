#!/bin/bash
# Bootstrap 1.6.2 Upgrade Test Script
# Run this to capture baseline and compare after upgrade

set -e

BASELINE_FILE="TEST_BASELINE_1.6.1.log"
UPGRADED_FILE="TEST_UPGRADED_1.6.2.log"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Bootstrap 1.6.2 Compatibility Test Script               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check current version
CURRENT_VERSION=$(grep "@elizaos/plugin-bootstrap" package.json | sed -n 's/.*"\([0-9.]*\)".*/\1/p')
echo "📦 Current plugin-bootstrap version: $CURRENT_VERSION"
echo ""

# Function to show test instructions
show_test_instructions() {
    echo "🧪 MANUAL TEST INSTRUCTIONS"
    echo "════════════════════════════════════════════════════════════"
    echo ""
    echo "In Telegram, send these test messages to your bot:"
    echo ""
    echo "  Test 1: /f"
    echo "  Test 2: /f PEPE"
    echo "  Test 3: PEPE is cool"
    echo "  Test 4: @pepedawn_bot hello"
    echo "  Test 5: just a normal message"
    echo ""
    echo "Watch the console logs for:"
    echo "  🔬 [TEST] markers (diagnostic logs)"
    echo "  🛡️ [Suppression] markers (suppression active)"
    echo "  ✅ [Suppression] Allowing FAKERARECARD send"
    echo "  📨 [Suppression] No suppression (for caps/mentions)"
    echo ""
    echo "════════════════════════════════════════════════════════════"
}

# Function to capture baseline
capture_baseline() {
    echo "📸 CAPTURING BASELINE (Version $CURRENT_VERSION)"
    echo ""
    show_test_instructions
    echo ""
    echo "Press ENTER when you've completed all test messages..."
    read
    
    echo ""
    echo "✅ Baseline test complete!"
    echo "   Check your console logs for 🔬 [TEST] markers"
    echo "   Save important log snippets to $BASELINE_FILE"
    echo ""
}

# Function to perform upgrade
perform_upgrade() {
    echo "📦 UPGRADING plugin-bootstrap to 1.6.2..."
    echo ""
    
    bun add @elizaos/plugin-bootstrap@1.6.2
    
    NEW_VERSION=$(grep "@elizaos/plugin-bootstrap" package.json | sed -n 's/.*"\([0-9.]*\)".*/\1/p')
    echo ""
    echo "✅ Upgraded to version: $NEW_VERSION"
    echo ""
}

# Function to run post-upgrade tests
run_upgraded_tests() {
    echo "🧪 RUNNING POST-UPGRADE TESTS"
    echo ""
    show_test_instructions
    echo ""
    echo "Press ENTER when you've completed all test messages..."
    read
    
    echo ""
    echo "✅ Post-upgrade test complete!"
    echo "   Check your console logs for any differences"
    echo "   Save important log snippets to $UPGRADED_FILE"
    echo ""
}

# Function to show comparison instructions
show_comparison() {
    echo "📊 COMPARISON CHECKLIST"
    echo "════════════════════════════════════════════════════════════"
    echo ""
    echo "Compare the following between baseline and upgraded logs:"
    echo ""
    echo "  ☐ Test 1 (/f): Both show suppression wrapper installed?"
    echo "  ☐ Test 1 (/f): Both allow FAKERARECARD send?"
    echo "  ☐ Test 1 (/f): Both suppress bootstrap?"
    echo "  ☐ Test 2 (/f PEPE): Card displayed in both?"
    echo "  ☐ Test 3 (PEPE): Both show 'No suppression'?"
    echo "  ☐ Test 4 (@mention): Both allow bootstrap?"
    echo "  ☐ Test 5 (normal): Both suppress correctly?"
    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo ""
    echo "If all checks pass: ✅ Safe to merge!"
    echo "If any check fails: ❌ DO NOT MERGE - Rollback required"
    echo ""
}

# Main menu
echo "What would you like to do?"
echo ""
echo "  1) Capture baseline (current version $CURRENT_VERSION)"
echo "  2) Perform upgrade to 1.6.2"
echo "  3) Run post-upgrade tests"
echo "  4) Show comparison checklist"
echo "  5) Full test sequence (1→2→3→4)"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        capture_baseline
        ;;
    2)
        perform_upgrade
        echo "⚠️  Remember to restart your bot before testing!"
        ;;
    3)
        run_upgraded_tests
        ;;
    4)
        show_comparison
        ;;
    5)
        capture_baseline
        perform_upgrade
        echo ""
        echo "⚠️  RESTART YOUR BOT NOW, then press ENTER to continue..."
        read
        run_upgraded_tests
        show_comparison
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Test script complete! Check TEST_PROTOCOL.md for full details."
echo "═══════════════════════════════════════════════════════════════"

