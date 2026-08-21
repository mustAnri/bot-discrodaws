#!/bin/sh
# docker-entrypoint.sh
#
# Jalan sebagai root (default image), lalu:
# 1. Pastikan DATA_DIR (volume Railway, default /data) dimiliki user `node`
#    — volume Railway di-mount root-owned, padahal app jalan sebagai node.
# 2. Drop privilege ke `node` via su-exec (bawaan node:alpine) dan exec CMD.
set -e

DATA_DIR="${DATA_DIR:-/data}"

if [ -d "$DATA_DIR" ]; then
    chown -R node:node "$DATA_DIR" 2>/dev/null || true
fi

exec su-exec node "$@"
