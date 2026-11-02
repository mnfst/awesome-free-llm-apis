#!/bin/bash
# Blocks the GitHub writes that a workflow does in Seb's name instead.
# Closing an issue or a pull request and opening a pull request through the Claude GitHub App
# put a Claude badge on Seb's avatar. The workflow .github/workflows/no-claude-badge.yml does
# these writes with Seb's token. See agents/triage.md and agents/provider-sync.md.
# Only cloud sessions write through the app. Local sessions use Seb's own gh login.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && [ -z "${GITHUB_TOKEN:-}" ]; then exit 0; fi
input="$(cat)"
tool="$(printf '%s' "$input" | sed -n 's/.*"tool_name" *: *"\([^"]*\)".*/\1/p' | head -n 1)"
if [ "$tool" = "Bash" ]; then
  # In the cloud, gh also goes through the Claude GitHub App.
  printf '%s' "$input" | grep -qE 'gh ' || exit 0
  printf '%s' "$input" | grep -qE 'state=closed|gh pr (create|close)|gh issue close|repos/[^ ]+/pulls( |"|$)' || exit 0
fi
echo "BLOCKED: do not close or open issues and pull requests yourself. To close, end your comment with <!-- close -->. To open a pull request, push a data/** branch: the commit subject is the title and the commit body is the description." >&2
exit 2
else (branch)
