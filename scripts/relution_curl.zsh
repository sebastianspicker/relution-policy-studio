# Relution curl authentication helper for zsh.
# Source this file; do not execute it as a standalone program.

__campusweave_relution_curl_has_safe_token() {
  [[ -n "${1:-}" && "${1}" != *$'\n'* && "${1}" != *$'\r'* ]]
}

__campusweave_relution_curl_has_valid_server() {
  local server="${1:-}"

  [[ "${server}" == https://* && "${server}" != *\?* && \
        "${server}" != *\#* && "${server}" != *@* && \
        "${server}" != *$'\n'* && "${server}" != *$'\r'* && \
        "${server}" != *' '* && "${server}" != *$'\t'* && \
        "${server}" != *\\* ]]
}

__campusweave_relution_curl_has_unambiguous_server() {
  local server="${1:-}"
  local server_remainder server_authority server_base

  server_remainder="${server#https://}"
  server_authority="${server_remainder%%/*}"
  server_base="${server_remainder#${server_authority}}"
  [[ -n "${server_authority}" && "${server_authority}" != *'/'* && \
        "${server_base}" != *'//'* && "${server_base}" != */./* && \
        "${server_base}" != */../* && "${server_base}" != */. && \
        "${server_base}" != */.. && "${server_base}" != *'%'* ]]
}

__campusweave_relution_curl_argument_has_token() {
  [[ "${1}" == *"${RELUTION_API_TOKEN}"* ]]
}

__campusweave_relution_curl_has_positive_timeout() {
  [[ "${1}" =~ '^[0-9]+([.][0-9]+)?$' && "${1}" != 0 && "${1}" != 0.0 ]]
}

__campusweave_relution_curl_is_documented_method() {
  [[ "${(U)1}" == GET || "${(U)1}" == POST || "${(U)1}" == PUT || \
        "${(U)1}" == PATCH || "${(U)1}" == DELETE ]]
}

__campusweave_relution_curl_is_allowed_header() {
  local header="${(L)1}"
  [[ "${1}" != *$'\n'* && "${1}" != *$'\r'* && \
        ( "${header}" == accept:* || "${header}" == content-type:* ) ]]
}

__campusweave_relution_curl_is_allowed_data_file() {
  (( ! $2 )) && [[ "${1}" == @* && "${1}" != @- ]]
}

__campusweave_relution_curl_is_evidence_path() {
  [[ -n "${1}" && "${1}" != - && "${1}" != -* && \
        "${1}" != *$'\n'* && "${1}" != *$'\r'* ]]
}

__campusweave_relution_curl_has_valid_request_url() {
  local request_url="${1:-}"

  [[ -n "${request_url}" && "${request_url}" == https://* && \
        "${request_url}" != *\#* && "${request_url}" != *@* && \
        "${request_url}" != *$'\n'* && "${request_url}" != *$'\r'* && \
        "${request_url}" != *' '* && "${request_url}" != *$'\t'* && \
        "${request_url}" != *\\* && "${request_url}" != *"${RELUTION_API_TOKEN}"* ]]
}

__campusweave_relution_curl_is_url_within_server() {
  local request_url="${1:-}" server="${2:-}"
  local server_remainder server_authority server_base
  local request_remainder request_authority request_path_and_query request_path

  server_remainder="${server#https://}"
  server_authority="${server_remainder%%/*}"
  server_base="${server_remainder#${server_authority}}"
  request_remainder="${request_url#https://}"
  request_authority="${request_remainder%%/*}"
  request_path_and_query="${request_remainder#${request_authority}}"
  request_path="${request_path_and_query%%\?*}"
  [[ "${request_authority}" == "${server_authority}" && \
        -n "${request_path}" && "${request_path}" == /* && \
        "${request_path}" != *'//'* && "${request_path}" != */./* && \
        "${request_path}" != */../* && "${request_path}" != */. && \
        "${request_path}" != */.. && "${request_path}" != *'%'* ]] || return 1
  [[ -z "${server_base}" || "${request_path}" == "${server_base}" || \
        "${request_path}" == "${server_base}"/* ]]
}

__campusweave_relution_curl_fail() {
  printf '%s\n' "${1}" >&2
  return 2
}

__campusweave_relution_curl_validate_environment() {
  if ! __campusweave_relution_curl_has_safe_token "${RELUTION_API_TOKEN:-}"; then
    __campusweave_relution_curl_fail 'Relution token is missing or contains a line break.'
    return
  fi
  if [[ "${(t)RELUTION_API_TOKEN}" == *-export* ]]; then
    __campusweave_relution_curl_fail 'Relution token must be an unexported shell variable.'
    return
  fi

  # The effective server is an explicit target pin.  It may include an API base
  # path, but cannot contain URL components that would make target comparison
  # ambiguous.
  __campusweave_relution_curl_server="${RELUTION_API_SERVER:-}"
  __campusweave_relution_curl_server="${__campusweave_relution_curl_server%/}"
  if ! __campusweave_relution_curl_has_valid_server "${__campusweave_relution_curl_server}"; then
    __campusweave_relution_curl_fail 'Relution curl requires a valid HTTPS RELUTION_API_SERVER.'
    return
  fi
  if ! __campusweave_relution_curl_has_unambiguous_server "${__campusweave_relution_curl_server}"; then
    __campusweave_relution_curl_fail 'Relution curl requires an unambiguous HTTPS RELUTION_API_SERVER.'
    return
  fi
}

__campusweave_relution_curl_reject_token_argument() {
  if __campusweave_relution_curl_argument_has_token "${1}"; then
    __campusweave_relution_curl_fail \
      'Relution curl rejected an argument containing authentication material.'
    return
  fi
}

__campusweave_relution_curl_validate_timeout() {
  if ! __campusweave_relution_curl_has_positive_timeout "${__campusweave_relution_curl_value}"; then
    __campusweave_relution_curl_fail 'Relution curl rejected an invalid timeout value.'
    return
  fi
}

__campusweave_relution_curl_normalize_method() {
  __campusweave_relution_curl_value="${(U)__campusweave_relution_curl_value}"
  if ! __campusweave_relution_curl_is_documented_method "${__campusweave_relution_curl_value}"; then
    __campusweave_relution_curl_fail 'Relution curl only permits documented HTTP request methods.'
    return
  fi
}

__campusweave_relution_curl_validate_header() {
  if ! __campusweave_relution_curl_is_allowed_header "${__campusweave_relution_curl_value}"; then
    __campusweave_relution_curl_fail 'Relution curl only permits Accept and Content-Type headers.'
    return
  fi
}

__campusweave_relution_curl_validate_data_file() {
  if ! __campusweave_relution_curl_is_allowed_data_file \
        "${__campusweave_relution_curl_value}" "${__campusweave_relution_curl_data_seen}"; then
    __campusweave_relution_curl_fail 'Relution curl requires one --data-binary @file request body.'
    return
  fi
  __campusweave_relution_curl_data_seen=1
}

__campusweave_relution_curl_validate_evidence_path() {
  if ! __campusweave_relution_curl_is_evidence_path "${__campusweave_relution_curl_value}"; then
    __campusweave_relution_curl_fail 'Relution curl requires a file path for evidence output.'
    return
  fi
}

__campusweave_relution_curl_validate_write_out() {
  if [[ "${__campusweave_relution_curl_value}" != '%{http_code}' ]]; then
    __campusweave_relution_curl_fail 'Relution curl only permits the HTTP status write-out template.'
    return
  fi
}

__campusweave_relution_curl_validate_option_value() {
  case "${1}" in
    --connect-timeout|--max-time)
      __campusweave_relution_curl_validate_timeout
      ;;
    --request|-X)
      __campusweave_relution_curl_normalize_method
      ;;
    --header|-H)
      __campusweave_relution_curl_validate_header
      ;;
    --data-binary)
      __campusweave_relution_curl_validate_data_file
      ;;
    --output|--dump-header)
      __campusweave_relution_curl_validate_evidence_path
      ;;
    --write-out)
      __campusweave_relution_curl_validate_write_out
      ;;
  esac
}

__campusweave_relution_curl_record_request_url() {
  if [[ -n "${__campusweave_relution_curl_request_url}" ]]; then
    __campusweave_relution_curl_fail 'Relution curl requires exactly one request URL.'
    return
  fi
  __campusweave_relution_curl_request_url="${1}"
}

__campusweave_relution_curl_parse_option_with_value() {
  local __campusweave_relution_curl_option="${1}"
  local __campusweave_relution_curl_value="${2:-}"
  local __campusweave_relution_curl_remaining="${3}"

  if (( __campusweave_relution_curl_remaining == 0 )); then
    __campusweave_relution_curl_fail 'Relution curl rejected an option without its required value.'
    return
  fi
  __campusweave_relution_curl_reject_token_argument "${__campusweave_relution_curl_value}" || return
  __campusweave_relution_curl_validate_option_value \
    "${__campusweave_relution_curl_option}" || return
  __campusweave_relution_curl_arguments+=(
    "${__campusweave_relution_curl_option}" "${__campusweave_relution_curl_value}"
  )
}

__campusweave_relution_curl_parse_arguments() {
  local __campusweave_relution_curl_option

  while (( $# > 0 )); do
    __campusweave_relution_curl_option="$1"
    shift

    __campusweave_relution_curl_reject_token_argument "${__campusweave_relution_curl_option}" || return

    case "${__campusweave_relution_curl_option}" in
      --fail|--fail-with-body|--silent|-s|--show-error|-S)
        __campusweave_relution_curl_arguments+=("${__campusweave_relution_curl_option}")
        ;;
      --connect-timeout|--max-time|--request|-X|--header|-H|--data-binary|--output|--dump-header|--write-out)
        __campusweave_relution_curl_parse_option_with_value \
          "${__campusweave_relution_curl_option}" "${1:-}" "$#" || return
        shift
        ;;
      --connect-timeout=*|--max-time=*|--request=*|--header=*|--data-binary=*|--output=*|--dump-header=*|--write-out=*|--*)
        __campusweave_relution_curl_fail 'Relution curl rejected an unsafe or ambiguous curl option.'
        return
        ;;
      -*)
        # Short-option bundles (for example, -vk) are deliberately forbidden:
        # their semantics can change when curl gains or changes short options.
        __campusweave_relution_curl_fail 'Relution curl rejected an unsafe or ambiguous curl option.'
        return
        ;;
      *)
        __campusweave_relution_curl_record_request_url \
          "${__campusweave_relution_curl_option}" || return
        ;;
    esac
  done
}

__campusweave_relution_curl_validate_request_url() {
  if ! __campusweave_relution_curl_has_valid_request_url \
        "${__campusweave_relution_curl_request_url}"; then
    __campusweave_relution_curl_fail 'Relution curl requires exactly one HTTPS request URL.'
    return
  fi
  if ! __campusweave_relution_curl_is_url_within_server \
        "${__campusweave_relution_curl_request_url}" "${__campusweave_relution_curl_server}"; then
    __campusweave_relution_curl_fail 'Relution curl rejected a URL outside RELUTION_API_SERVER.'
    return
  fi
}

__campusweave_relution_curl_execute_request() {
  local __campusweave_relution_curl_escaped_token="${RELUTION_API_TOKEN//\\/\\\\}"
  __campusweave_relution_curl_escaped_token="${__campusweave_relution_curl_escaped_token//\"/\\\"}"
  local __campusweave_relution_curl_auth_config="header = \"X-User-Access-Token: ${__campusweave_relution_curl_escaped_token}\""

  # The zsh builtin emits the secret through a pipe rather than a
  # process argument, exported environment variable, persistent file, or
  # disk-backed here-string.  --disable blocks ambient curl configuration;
  # --globoff and --noproxy '*' ensure one pinned destination without proxy
  # rerouting.  User-provided curl options are restricted above.
  builtin print -r -- "${__campusweave_relution_curl_auth_config}" | command curl --disable --config - --globoff --noproxy '*' \
    "${__campusweave_relution_curl_arguments[@]}" "${__campusweave_relution_curl_request_url}"
}

relution_curl() {
  local __campusweave_relution_curl_server=''
  local -a __campusweave_relution_curl_arguments=()
  local __campusweave_relution_curl_request_url=''
  local __campusweave_relution_curl_data_seen=0

  __campusweave_relution_curl_validate_environment || return
  __campusweave_relution_curl_parse_arguments "$@" || return
  __campusweave_relution_curl_validate_request_url || return
  __campusweave_relution_curl_execute_request
}
