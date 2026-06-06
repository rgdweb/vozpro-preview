#!/bin/bash
export PORT=3001
export HOSTNAME=0.0.0.0
cd /home/ubuntu/omnivoice
exec node .next/standalone/server.js
