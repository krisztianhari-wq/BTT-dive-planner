#!/bin/sh
# Starts the Vite dev server using the project-local Node.js in .node/
cd "$(dirname "$0")"
export PATH="$PWD/.node/bin:$PATH"
exec npm run dev -- --port 5173 --strictPort "$@"
