#!/bin/bash
# Cloudflare Pages build script
# Root Directory 设为 client/，此脚本在该目录下执行
set -e

echo ">>> Installing dependencies..."
npm install

echo ">>> Building client..."
npm run build

echo ">>> Build complete. Output in dist/"
