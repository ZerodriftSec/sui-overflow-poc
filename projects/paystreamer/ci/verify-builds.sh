#!/bin/bash
set -e

echo "=> Verifying builds across all workspace packages..."

echo "-> Building packages/sdk..."
cd packages/sdk
pnpm build
cd ../..

echo "-> Building apps/scheduler..."
cd apps/scheduler
pnpm build
cd ../..

echo "-> Building apps/docs..."
cd apps/docs
pnpm build
cd ../..

echo "-> Running tests in packages/sdk..."
cd packages/sdk
npx vitest run --exclude '**/*-e2e.test.ts*'
cd ../..

echo "-> Running tests in apps/docs..."
cd apps/docs
npx vitest run
cd ../..

echo "=> All builds and tests succeeded!"
