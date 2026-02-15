#!/usr/bin/env bash

# Ralph loop style harness for Codex:
# Default behavior uses a single interactive Codex session.
# Optionally, use --non-interactive to run in codex exec mode (suitable for no-TTY runs).

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./ralph-loop.sh --count <N> --prompt <PROMPT> [--session-id <SESSION_ID>] [--new-agent]
    [--plan-prompt <PROMPT>] [--plan-prompt-file <PATH>] [--state-file <PATH>]
    [--non-interactive] [--sandbox <read-only|workspace-write|danger-full-access>]
    [--bypass-sandbox] [--progress-window <N>] [--min-delta-lines <N>] [--allow-low-progress]
    [--completion-poll-interval <SECONDS>] [--completion-timeout <SECONDS>] [--log-file <PATH>] -- [codex args...]

Examples:
  ./ralph-loop.sh --count 5 --prompt "Please continue from where you left off."
  ./ralph-loop.sh --count 3 --prompt-file .codex-loop-prompt.txt --state-file .ralph/session-state.md -- --no-alt-screen
  ./ralph-loop.sh --count 5 --prompt "Please continue." --session-id <SESSION_ID> --new-agent -- --no-alt-screen
  ./ralph-loop.sh --count 5 --prompt "Please continue." --session-id <SESSION_ID> --non-interactive -- -c model="gpt-5.3-codex-spark"
  ./ralph-loop.sh --count 20 --prompt "..." --session-id <SESSION_ID> --non-interactive --log-file /tmp/ralph-loop.log
  ./ralph-loop.sh --count 20 --prompt "..." --session-id <SESSION_ID> --non-interactive --plan-prompt "Assess status, then plan." -- -c model="gpt-5.3-codex-spark"
  ./ralph-loop.sh --count 20 --prompt "..." --session-id <SESSION_ID> --progress-window 10 --min-delta-lines 500 -- -c model="gpt-5.3-codex-spark"
  ./ralph-loop.sh --count 20 --prompt "..." --session-id <SESSION_ID> --non-interactive --sandbox danger-full-access -- -c model="gpt-5.3-codex-spark"
  ./ralph-loop.sh --count 20 --prompt "..." --session-id <SESSION_ID> --non-interactive --bypass-sandbox -- -c model="gpt-5.3-codex-spark"
  ./ralph-loop.sh --count 20 --prompt "..." --session-id <SESSION_ID> --non-interactive --completion-poll-interval 5 --completion-timeout 120 -- -c model="gpt-5.3-codex-spark"
EOF
  exit 1
}

iterations=1
prompt=""
prompt_file=""
plan_prompt=""
plan_prompt_file=""
sleep_seconds=0
session_id=""
interactive=1
log_file=""
state_file=".ralph/session-state.md"
codex_sandbox=""
bypass_sandbox=0
progress_window=10
min_delta_lines=500
allow_low_progress=0
new_agent=0
completion_poll_interval=5
completion_timeout_seconds=120
run_id="$(date +%s)"
repo_root="$(pwd -P)"

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
    --plan-prompt)
      plan_prompt="$2"
      shift 2
      ;;
    --plan-prompt-file)
      plan_prompt_file="$2"
      shift 2
      ;;
    --session-id)
      session_id="$2"
      shift 2
      ;;
    --state-file)
      state_file="$2"
      shift 2
      ;;
    --sandbox)
      codex_sandbox="$2"
      case "$codex_sandbox" in
        read-only|workspace-write|danger-full-access)
          ;;
        *)
          echo "Error: --sandbox must be read-only, workspace-write, or danger-full-access." >&2
          usage
          ;;
      esac
      shift 2
      ;;
    --log-file)
      log_file="$2"
      shift 2
      ;;
    --bypass-sandbox)
      bypass_sandbox=1
      shift
      ;;
    --progress-window)
      progress_window="$2"
      shift 2
      ;;
    --min-delta-lines)
      min_delta_lines="$2"
      shift 2
      ;;
    --completion-poll-interval)
      completion_poll_interval="$2"
      shift 2
      ;;
    --completion-timeout)
      completion_timeout_seconds="$2"
      shift 2
      ;;
    --allow-low-progress)
      allow_low_progress=1
      shift
      ;;
    --non-interactive)
      interactive=0
      shift
      ;;
    --new-agent)
      new_agent=1
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

if [[ "$plan_prompt_file" != "" ]]; then
  plan_prompt="$(cat "$plan_prompt_file")"
fi

if [[ "$prompt" == "" ]]; then
  echo "Error: a prompt is required. Use --prompt or --prompt-file." >&2
  usage
fi

if [[ "$plan_prompt" == "" ]]; then
  plan_prompt="Assess current status and prepare a concise execution plan for this project before making any edits.

Output:
- What is complete and what is still missing.
- What likely changed state is currently visible from the repo/diff.
- The highest-priority next step to unlock stable progress.
Do not edit files in this step."
fi

if [[ "$iterations" -le 0 ]]; then
  echo "Error: --count must be a positive integer." >&2
  usage
fi

if [[ "$progress_window" -le 0 ]]; then
  echo "Error: --progress-window must be a positive integer." >&2
  exit 1
fi
if [[ "$min_delta_lines" -lt 0 ]]; then
  echo "Error: --min-delta-lines must be zero or greater." >&2
  exit 1
fi
if [[ "$completion_poll_interval" -lt 0 ]]; then
  echo "Error: --completion-poll-interval must be zero or greater." >&2
  exit 1
fi
if [[ "$completion_timeout_seconds" -lt 0 ]]; then
  echo "Error: --completion-timeout must be zero or greater." >&2
  exit 1
fi

codex_args=("$@")

mkdir -p "$(dirname "$state_file")"
codex_sessions_dir="${HOME}/.codex/sessions"
codex_session_file=""

extract_session_id() {
  local file="$1"
  sed -n 's/.*session id:[[:space:]]*\([0-9a-fA-F-][0-9a-fA-F-]*\).*/\1/p' "$file" | tail -n1
}

resolve_session_file() {
  local sid="$1"
  if [[ -z "$sid" ]]; then
    echo ""
    return 0
  fi
  if [[ -n "$codex_session_file" && "$codex_session_file" == *"$sid"* ]]; then
    echo "$codex_session_file"
    return 0
  fi

  codex_session_file="$(rg --files "$codex_sessions_dir" -g '*.jsonl' | rg "$sid" | head -n 1 || true)"
  echo "$codex_session_file"
}

latest_turn_id() {
  local session_file="$1"
  if [[ -z "$session_file" || ! -f "$session_file" ]]; then
    echo ""
    return 0
  fi
  rg -n '"type":"turn_context"' "$session_file" \
    | tail -n 1 \
    | sed -E 's/.*"turn_id":"([^"]+)".*/\1/'
}

turn_completed() {
  local session_file="$1"
  local turn_id="$2"

  if [[ -z "$session_file" || -z "$turn_id" ]]; then
    echo 1
    return 0
  fi

  local status
  status="$(awk -v turn_id="$turn_id" '
    $0 ~ "\"type\":\"turn_context\"" && $0 ~ ("\"turn_id\":\"" turn_id "\"") {
      in_turn = 1
      complete = 0
      next
    }
    in_turn && $0 ~ "\"type\":\"turn_context\"" && $0 !~ ("\"turn_id\":\"" turn_id "\"") {
      in_turn = 0
    }
    in_turn && $0 ~ "\"type\":\"event_msg\".*\"type\":\"task_complete\"" {
      complete = 1
      exit
    }
    END {
      print complete + 0
    }
  ' "$session_file")"

  if [[ "$status" == "1" ]]; then
    echo 1
  else
    echo 0
  fi
}

wait_for_turn_completion() {
  local session_file="$1"
  local turn_id="$2"

  if (( completion_poll_interval <= 0 )); then
    return 0
  fi
  if [[ -z "$session_file" || ! -f "$session_file" ]]; then
    return 0
  fi

  local waited=0
  local complete
  while true; do
    complete="$(turn_completed "$session_file" "$turn_id")"
    if [[ "$complete" == "1" ]]; then
      return 0
    fi

    if (( completion_timeout_seconds > 0 && waited >= completion_timeout_seconds )); then
      echo "[RALPH-LOOP] timed out waiting for turn $turn_id to complete after ${completion_timeout_seconds}s." >&2
      return 1
    fi

    echo "[RALPH-LOOP] waiting for session ${session_file} turn ${turn_id} completion..." >&2
    sleep "$completion_poll_interval"
    waited=$((waited + completion_poll_interval))
  done
}

build_context_prompt() {
  local phase="$1"
  local base_prompt="$2"
  local iteration="$3"

  local previous_state=""
  if [[ -f "$state_file" ]]; then
    previous_state="$(sed -n '1,80p' "$state_file")"
  else
    previous_state="No prior state file found. This appears to be a fresh run."
  fi

  local repo_status
  repo_status="$(git -C "$repo_root" status --short 2>/dev/null | sed -n '1,60p')"
  if [[ -z "$repo_status" ]]; then
    repo_status="(working tree is clean)"
  fi

  local diff_stat
  diff_stat="$(git -C "$repo_root" diff --stat 2>/dev/null | sed -n '1,80p')"
  if [[ -z "$diff_stat" ]]; then
    diff_stat="(no diff)"
  fi

  local recent_log=""
  if [[ -n "$log_file" ]]; then
    recent_log="$(tail -n 6 "$log_file" 2>/dev/null)"
    if [[ -z "$recent_log" ]]; then
      recent_log="(no previous loop log entries yet)"
    fi
  else
    recent_log="(log file not configured)"
  fi

  cat <<EOF
$base_prompt

Execution context:
- Session: ${session_id:-unknown}
- Run: $run_id
- Iteration: $iteration / $iterations
- Phase: $phase
- Working branch: $(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
- Repo root: $repo_root

Project state snapshot:
$previous_state

Repo status:
$repo_status

Diff summary:
$diff_stat

Recent loop log:
$recent_log

Important continuation contract:
- Continue from the state above and avoid repeating work already completed.
- If no actual progress was made since the previous turn, pivot to a different next action and report why.
EOF
}

log_state() {
  local iteration="$1"
  local mode="$2"
  local exit_code="$3"
  local elapsed="$4"
  local total_changed_lines="$5"
  local window_lines="$6"
  local delta_in_window="$7"

  local repo_status
  local diff_stat
  repo_status="$(git -C "$repo_root" status --short 2>/dev/null | sed -n '1,80p')"
  diff_stat="$(git -C "$repo_root" diff --stat 2>/dev/null | sed -n '1,80p')"

  cat > "$state_file" <<EOF
# Ralph loop state

run_id: $run_id
session_id: ${session_id:-unknown}
mode: $mode
iteration: $iteration / $iterations
exit_code: $exit_code
elapsed_seconds: $elapsed
total_changed_lines: $total_changed_lines
progress_window: $progress_window
progress_goal: $min_delta_lines
progress_delta_since_window: $delta_in_window
updated_at: $(date -u +'%Y-%m-%dT%H:%M:%SZ')

## repo_status
$repo_status

## diff_stat
$diff_stat
EOF
}

codex_base_cmd=(codex)
if (( interactive == 0 )); then
  codex_base_cmd=(codex exec)
fi

if [[ -n "$codex_sandbox" ]]; then
  codex_base_cmd+=(-s "$codex_sandbox")
fi

if (( bypass_sandbox )); then
  codex_base_cmd+=(--dangerously-bypass-approvals-and-sandbox)
fi

if (( ${#codex_args[@]} > 0 )); then
  codex_base_cmd+=("${codex_args[@]}")
fi

if (( new_agent == 1 )); then
  session_id=""
fi

count_changed_lines() {
  git -C "$repo_root" diff --numstat 2>/dev/null \
    | awk '{sum += ($1 ~ /^[0-9]+$/ ? $1 : 0) + ($2 ~ /^[0-9]+$/ ? $2 : 0)} END {print sum+0}'
}

window_start_lines="$(count_changed_lines)"
window_start_iter=0

log_event() {
  local iteration="$1"
  local status="$2"
  local phase="$3"
  local exit_code="${4:-}"
  local elapsed="${5:-}"
  local session_label="$6"
  local timestamp
  timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  local line="[$timestamp] run=$run_id iter=${iteration}/${iterations} session=${session_label} phase=${phase} status=${status}"
  if [[ "$status" == "ended" ]]; then
    line+=" exit=${exit_code} elapsed=${elapsed}s"
  fi
  if [[ -n "$log_file" ]]; then
    echo "$line" >> "$log_file"
  fi
  echo "$line" >&2
}

if [[ -n "$log_file" ]]; then
  echo "[START] run=$run_id count=$iterations session=${session_id:-last} state_file=$state_file mode=$([ $interactive -eq 1 ] && echo interactive || echo non-interactive) new_agent=$new_agent" > "$log_file"
fi

run_index=0

while (( run_index < iterations )); do
  run_index=$((run_index + 1))
  session_label="${session_id:-last}"
  if (( run_index == 1 )); then
    prompt_to_send="$(build_context_prompt "planning" "$plan_prompt" "$run_index")"
  else
    prompt_to_send="$(build_context_prompt "execution" "$prompt" "$run_index")"
  fi

  log_event "$run_index" "starting" "$([ ${run_index} -eq 1 ] && echo planning || echo execution)" "" "" "$session_label"
  iteration_start=$(date +%s)

  output_file="$(mktemp)"
  iteration_cmd=("${codex_base_cmd[@]}")

  if (( run_index == 1 )); then
    if [[ -n "$session_id" ]]; then
      iteration_cmd+=(resume "$session_id")
    fi
  else
    if [[ -n "$session_id" ]]; then
      iteration_cmd+=(resume "$session_id")
    else
      iteration_cmd+=(resume --last)
    fi
  fi

  if "${iteration_cmd[@]}" "$prompt_to_send" > "$output_file" 2>&1; then
    exit_code=0
  else
    exit_code=$?
  fi

  detected_session_id="$(extract_session_id "$output_file")"
  if [[ -n "$detected_session_id" ]]; then
    session_id="$detected_session_id"
  fi

  cat "$output_file" >&2
  rm -f "$output_file"

  iteration_end=$(date +%s)
  elapsed=$(( iteration_end - iteration_start ))
  log_event "$run_index" "ended" "$([ ${run_index} -eq 1 ] && echo planning || echo execution)" "$exit_code" "$elapsed" "$session_label"

  current_changed_lines="$(count_changed_lines)"
  window_delta=$((current_changed_lines - window_start_lines))
  log_state "$run_index" "$([ $run_index -eq 1 ] && echo planning || echo execution)" "$exit_code" "$elapsed" "$current_changed_lines" "$min_delta_lines" "$window_delta"

  session_file="$(resolve_session_file "$session_id")"
  turn_id="$(latest_turn_id "$session_file")"
  if [[ -n "$session_file" && -n "$turn_id" ]]; then
    wait_for_turn_completion "$session_file" "$turn_id" || true
  fi

  if (( run_index % progress_window == 0 )); then
    if (( allow_low_progress == 0 && window_delta < min_delta_lines )); then
      delta_msg="Iteration ${run_index} progress gate failed: changed ${window_delta} lines since checkpoint, below required ${min_delta_lines} over last ${progress_window} iterations."
      echo "$delta_msg" >&2
      if [[ -n "$log_file" ]]; then
        echo "$delta_msg" >> "$log_file"
      fi
      exit 1
    fi
    window_start_lines="$current_changed_lines"
    window_start_iter="$run_index"
  fi

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
