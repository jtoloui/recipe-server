#!/bin/bash
# Lambda Web Adapter entrypoint. LWA (via /opt/bootstrap) starts this, which
# boots the Express server on $PORT; LWA then proxies Function URL events to it.
# lambda-bootstrap hydrates secrets from SSM before importing the app.
cd "$LAMBDA_TASK_ROOT" || exit 1
exec node dist/src/lambda-bootstrap.js
