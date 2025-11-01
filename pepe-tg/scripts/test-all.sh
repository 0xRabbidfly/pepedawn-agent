#!/bin/sh
# Pre-commit hook: Run all custom tests before commit

echo "🧪 Running all custom tests (11 test files)..."
echo ""

cd pepe-tg

# Test 1: Bootstrap suppression
echo "1/11 Testing bootstrap suppression..."
bun test src/__tests__/bootstrap-suppression.test.ts
if [ $? -ne 0 ]; then
  echo "❌ Bootstrap suppression tests failed. Commit aborted."
  exit 1
fi

# Test 2: Auto-routing
echo ""
echo "2/11 Testing auto-routing logic..."
bun test src/__tests__/auto-routing.test.ts
if [ $? -ne 0 ]; then
  echo "❌ Auto-routing tests failed. Commit aborted."
  exit 1
fi

# Test 3: Query classifier
echo ""
echo "3/11 Testing query classifier..."
bun test src/__tests__/utils/queryClassifier.test.ts
if [ $? -ne 0 ]; then
  echo "❌ Query classifier tests failed. Commit aborted."
  exit 1
fi

# Test 4: Vision analyzer utility
echo ""
echo "4/11 Testing vision analyzer utility..."
bun test src/__tests__/utils/visionAnalyzer.test.ts
if [ $? -ne 0 ]; then
  echo "❌ Vision analyzer tests failed. Commit aborted."
  exit 1
fi

# Test 5: Lore retrieval & hybrid search
echo ""
echo "5/11 Testing lore retrieval and hybrid card search..."
bun test src/__tests__/utils/loreRetrieval.test.ts
if [ $? -ne 0 ]; then
  echo "❌ Lore retrieval tests failed. Commit aborted."
  exit 1
fi

# Test 6: Memory storage utilities
echo ""
echo "6/11 Testing memory storage utilities..."
bun test src/__tests__/utils/memoryStorage.test.ts
if [ $? -ne 0 ]; then
  echo "❌ Memory storage tests failed. Commit aborted."
  exit 1
fi

# Test 7: /fv command
echo ""
echo "7/11 Testing /fv command..."
bun test src/__tests__/actions/fakeVisualCommand.test.ts
if [ $? -ne 0 ]; then
  echo "❌ /fv command tests failed. Commit aborted."
  exit 1
fi

# Test 8: /ft command
echo ""
echo "8/11 Testing /ft command..."
bun test src/__tests__/actions/fakeTestCommand.test.ts
if [ $? -ne 0 ]; then
  echo "❌ /ft command tests failed. Commit aborted."
  exit 1
fi

# Test 9: /fl command
echo ""
echo "9/11 Testing /fl command..."
bun test src/__tests__/actions/loreCommand.test.ts
if [ $? -ne 0 ]; then
  echo "❌ /fl command tests failed. Commit aborted."
  exit 1
fi

# Test 10: /fr command
echo ""
echo "10/11 Testing /fr command..."
bun test src/__tests__/actions/fakeRememberCommand.test.ts
if [ $? -ne 0 ]; then
  echo "❌ /fr command tests failed. Commit aborted."
  exit 1
fi

# Test 11: Integration tests
echo ""
echo "11/11 Testing plugin routing integration..."
bun test src/__tests__/integration/visual-commands.test.ts
if [ $? -ne 0 ]; then
  echo "❌ Integration tests failed. Commit aborted."
  exit 1
fi

echo ""
echo "✅ All 11 custom tests passed!"
exit 0

