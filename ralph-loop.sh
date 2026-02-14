#!/usr/bin/env bash

# Ralph loop style harness for Codex:
# Default behavior uses a single interactive Codex session.
# Optionally, use --non-interactive to run in codex exec mode (suitable for no-TTY runs).

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./ralph-loop.sh --count <N> --prompt <PROMPT> [--session-id <SESSION_ID>] [--non-interactive] -- [codex args...]

Examples:
  ./ralph-loop.sh --count 5 --prompt "Please continue from where you left off."
  ./ralph-loop.sh --count 3 --prompt-file .codex-loop-prompt.txt -- --no-alt-screen
  ./ralph-loop.sh --count 5 --prompt "Please continue." --session-id <SESSION_ID> -- --no-alt-screen
  ./ralph-loop.sh --count 5 --prompt "Please continue." --session-id <SESSION_ID> --non-interactive -- -c model="gpt-5.3-codex-spark"
EOF
  exit 1
}

iterations=1
prompt=""
prompt_file=""
sleep_seconds=0
session_id=""
interactive=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--count)
      iterations="$2"
      shift 2
      ;;
    -p|--prompt)
      prompt="$2"
      shift 2
      ;;
    -f|--prompt-file)
      prompt_file="$2"
      shift 2
      ;;
    --session-id)
      session_id="$2"
      shift 2
      ;;
    --non-interactive)
      interactive=0
      shift
      ;;
    -s|--sleep)
      sleep_seconds="$2"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    -h|--help)
      usage
      ;;
    *)
      break
      ;;
  esac
done

if [[ "$prompt_file" != "" ]]; then
  prompt="$(cat "$prompt_file")"
fi

if [[ "$prompt" == "" ]]; then
  echo "Error: a prompt is required. Use --prompt or --prompt-file." >&2
  usage
fi

if [[ "$iterations" -le 0 ]]; then
  echo "Error: --count must be a positive integer." >&2
  usage
fi

codex_args=("$@")

if (( interactive )); then
  if [[ -n "$session_id" ]]; then
    start_codex_cmd=(codex resume "$session_id")
    resume_codex_cmd=(codex resume "$session_id")
  else
    start_codex_cmd=(codex)
    resume_codex_cmd=(codex resume --last)
  fi
else
  if [[ -n "$session_id" ]]; then
    start_codex_cmd=(codex exec resume "$session_id")
    resume_codex_cmd=(codex exec resume "$session_id")
  else
    start_codex_cmd=(codex exec)
    resume_codex_cmd=(codex exec resume --last)
  fi
fi

if (( ${#codex_args[@]} > 0 )); then
  start_codex_cmd+=("${codex_args[@]}")
  resume_codex_cmd+=("${codex_args[@]}")
fi

run_index=0

while (( run_index < iterations )); do
  run_index=$((run_index + 1))
  echo "=== Ralph loop iteration $run_index/$iterations ===" >&2

  if (( run_index == 1 )); then
    "${start_codex_cmd[@]}" "$prompt"
  else
    "${resume_codex_cmd[@]}" "$prompt"
  fi
  exit_code=$?

  if (( run_index >= iterations )); then
    break
  fi

  echo "Run stopped with exit code $exit_code; re-sending loop prompt..." >&2
  if (( sleep_seconds > 0 )); then
    sleep "$sleep_seconds"
  fi
done
