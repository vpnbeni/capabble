#!/usr/bin/env bash
# Entry point for GitHub Actions deploys (.github/workflows/deploy-*.yml).
#
# Copy to ~/ci-deploy.sh on the EC2 box (chmod +x) and pin the deploy key to it
# in ~/.ssh/authorized_keys, so that key can run nothing but these two scripts:
#
#   restrict,command="/home/ubuntu/ci-deploy.sh" ssh-ed25519 AAAA... github-actions-deploy
#
# The workflow asks for "stage" or "prod"; sshd passes that in SSH_ORIGINAL_COMMAND.
set -euo pipefail

# Non-interactive SSH skips ~/.bashrc, so load nvm here if node came from it.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" > /dev/null
fi

case "${SSH_ORIGINAL_COMMAND:-}" in
  stage) exec "$HOME/deploy-stage.sh" ;;
  prod)  exec "$HOME/deploy-prod.sh" ;;
  *)
    echo "ci-deploy: expected 'stage' or 'prod', got '${SSH_ORIGINAL_COMMAND:-}'" >&2
    exit 2
    ;;
esac
