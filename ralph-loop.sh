#!/usr/bin/env bash

# Ralph loop style harness for Codex:
# Default behavior uses a single interactive Codex session.
# Optionally, use --non-interactive to run in codex exec mode (suitable for no-TTY runs).

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./ralph-loop.sh --count <N> --prompt <PROMPT> [--session-id <SESSION_ID>] [--non-interactive] [--log-file <PATH>] -- [codex args...]

Examples:
  ./ralph-loop.sh --count 5 --prompt "Please continue from where you left off."
  ./ralph-loop.sh --count 3 --prompt-file .codex-loop-prompt.txt -- --no-alt-screen
  ./ralph-loop.sh --count 5 --prompt "Please continue." --session-id <SESSION_ID> -- --no-alt-screen
  ./ralph-loop.sh --count 5 --prompt "Please continue." --session-id <SESSION_ID> --non-interactive -- -c model="gpt-5.3-codex-spark"
  ./ralph-loop.sh --count 20 --prompt "..." --session-id <SESSION_ID> --non-interactive --log-file /tmp/ralph-loop.log
EOF
  exit 1
}

iterations=1
prompt=""
prompt_file=""
sleep_seconds=0
session_id=""
interactive=1
log_file=""
run_id="$(date +%s)"

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
    --log-file)
      log_file="$2"
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

log_event() {
  local iteration="$1"
  local status="$2"
  local exit_code="${3:-}"
  local elapsed="${4:-}"
  local session_label="$5"
  local timestamp
  timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  local line="[$timestamp] run=$run_id iter=${iteration}/${iterations} session=${session_label} status=${status}"
  if [[ "$status" == "ended" ]]; then
    line+=" exit=${exit_code} elapsed=${elapsed}s"
  fi
  if [[ -n "$log_file" ]]; then
    echo "$line" >> "$log_file"
  fi
  echo "$line" >&2
}

if [[ -n "$log_file" ]]; then
  echo "[START] run=$run_id count=$iterations session=${session_id:-last} mode=$([ $interactive -eq 1 ] && echo interactive || echo non-interactive)" > "$log_file"
fi

run_index=0

while (( run_index < iterations )); do
  run_index=$((run_index + 1))
  session_label="${session_id:-last}"
  log_event "$run_index" "starting" "" "" "$session_label"
  iteration_start=$(date +%s)

  if (( run_index == 1 )); then
    "${start_codex_cmd[@]}" "$prompt"
  else
    "${resume_codex_cmd[@]}" "$prompt"
  fi
  exit_code=$?
  iteration_end=$(date +%s)
  elapsed=$(( iteration_end - iteration_start ))
  log_event "$run_index" "ended" "$exit_code" "$elapsed" "$session_label"

  if (( run_index >= iterations )); then
    break
  fi

  echo "[RALPH-LOOP] iteration $run_index completed with exit code $exit_code; re-sending loop prompt." >&2
  if (( sleep_seconds > 0 )); then
    sleep "$sleep_seconds"
  fi
done

if [[ -n "$log_file" ]]; then
  echo "[END] run=$run_id complete exit_last=$exit_code" >> "$log_file"
fi
