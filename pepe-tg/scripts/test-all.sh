#!/bin/sh
# Pre-commit hook: Run all 6 custom tests before commit

echo "🧪 Running all custom tests (6 test files)..."
echo ""

cd pepe-tg

# Test 1: Bootstrap suppression
echo "1/6 Testing bootstrap suppression..."
bun test src/__tests__/bootstrap-suppression.test.ts
if [ $? -ne 0 ]; then
  echo "❌ Bootstrap suppression tests failed. Commit aborted."
  exit 1
fi

# Test 2: Vision analyzer utility
echo ""
echo "2/6 Testing vision analyzer utility..."
bun test src/__tests__/utils/visionAnalyzer.test.ts
if [ $? -ne 0 ]; then
  echo "❌ Vision analyzer tests failed. Commit aborted."
  exit 1
fi

# Test 3: Lore retrieval & hybrid search
echo ""
echo "3/6 Testing lore retrieval and hybrid card search..."
bun test src/__tests__/utils/loreRetrieval.test.ts
if [ $? -ne 0 ]; then
  echo "❌ Lore retrieval tests failed. Commit aborted."
  exit 1
fi

# Test 4: /fv command
echo ""
echo "4/6 Testing /fv command..."
bun test src/__tests__/actions/fakeVisualCommand.test.ts
if [ $? -ne 0 ]; then
  echo "❌ /fv command tests failed. Commit aborted."
  exit 1
fi

# Test 5: /ft command
echo ""
echo "5/6 Testing /ft command..."
bun test src/__tests__/actions/fakeTestCommand.test.ts
if [ $? -ne 0 ]; then
  echo "❌ /ft command tests failed. Commit aborted."
  exit 1
fi

# Test 6: Integration tests
echo ""
echo "6/6 Testing plugin routing integration..."
bun test src/__tests__/integration/visual-commands.test.ts
if [ $? -ne 0 ]; then
  echo "❌ Integration tests failed. Commit aborted."
  exit 1
fi

echo ""
echo "✅ All 6 custom tests passed!"
exit 0

