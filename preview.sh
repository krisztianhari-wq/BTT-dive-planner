#!/bin/sh
# Serves the production build (dist/) using the project-local Node.js in .node/
cd "$(dirname "$0")"
export PATH="$PWD/.node/bin:$PATH"
exec npm run preview -- --port 4173 --strictPort "$@"
