# Relution curl authentication helper for zsh.
# Source this file; do not execute it as a standalone program.

relution_curl() {
  if [[ -z "${RELUTION_API_TOKEN:-}" || \
        "${RELUTION_API_TOKEN}" == *$'\n'* || \
        "${RELUTION_API_TOKEN}" == *$'\r'* ]]; then
    printf '%s\n' 'Relution token is missing or contains a line break.' >&2
    return 2
  fi

  # The effective server is an explicit target pin.  It may include an API base
  # path, but cannot contain URL components that would make target comparison
  # ambiguous.
  local server="${RELUTION_API_SERVER:-}"
  server="${server%/}"
  local server_remainder server_authority server_base
  if [[ "${server}" != https://* || "${server}" == *\?* || \
        "${server}" == *\#* || "${server}" == *@* || \
        "${server}" == *$'\n'* || "${server}" == *$'\r'* || \
        "${server}" == *' '* || "${server}" == *$'\t'* || \
        "${server}" == *\\* ]]; then
    printf '%s\n' 'Relution curl requires a valid HTTPS RELUTION_API_SERVER.' >&2
    return 2
  fi
  server_remainder="${server#https://}"
  server_authority="${server_remainder%%/*}"
  server_base="${server_remainder#${server_authority}}"
  if [[ -z "${server_authority}" || "${server_authority}" == *'/'* || \
        "${server_base}" == *'//'* || "${server_base}" == */./* || \
        "${server_base}" == */../* || "${server_base}" == */. || \
        "${server_base}" == */.. || "${server_base}" == *'%'* ]]; then
    printf '%s\n' 'Relution curl requires an unambiguous HTTPS RELUTION_API_SERVER.' >&2
    return 2
  fi

  local -a curl_arguments
  local option value header method request_url=''
  local data_seen=0
  while (( $# > 0 )); do
    option="$1"
    shift

    if [[ "${option}" == *"${RELUTION_API_TOKEN}"* ]]; then
      printf '%s\n' \
        'Relution curl rejected an argument containing authentication material.' >&2
      return 2
    fi

    case "${option}" in
      --fail|--fail-with-body|--silent|-s|--show-error|-S)
        curl_arguments+=("${option}")
        ;;
      --connect-timeout|--max-time|--request|-X|--header|-H|--data-binary|--output|--dump-header|--write-out)
        if (( $# == 0 )); then
          printf '%s\n' 'Relution curl rejected an option without its required value.' >&2
          return 2
        fi
        value="$1"
        shift
        if [[ "${value}" == *"${RELUTION_API_TOKEN}"* ]]; then
          printf '%s\n' \
            'Relution curl rejected an argument containing authentication material.' >&2
          return 2
        fi
        case "${option}" in
          --connect-timeout|--max-time)
            if [[ ! "${value}" =~ '^[0-9]+([.][0-9]+)?$' || "${value}" == 0 || "${value}" == 0.0 ]]; then
              printf '%s\n' 'Relution curl rejected an invalid timeout value.' >&2
              return 2
            fi
            ;;
          --request|-X)
            method="${(U)value}"
            if [[ "${method}" != GET && "${method}" != POST && "${method}" != PUT && \
                  "${method}" != PATCH && "${method}" != DELETE ]]; then
              printf '%s\n' 'Relution curl only permits documented HTTP request methods.' >&2
              return 2
            fi
            value="${method}"
            ;;
          --header|-H)
            header="${(L)value}"
            if [[ "${value}" == *$'\n'* || "${value}" == *$'\r'* ]]; then
              printf '%s\n' 'Relution curl only permits Accept and Content-Type headers.' >&2
              return 2
            fi
            if [[ "${header}" != accept:* && "${header}" != content-type:* ]]; then
              printf '%s\n' 'Relution curl only permits Accept and Content-Type headers.' >&2
              return 2
            fi
            ;;
          --data-binary)
            if (( data_seen )) || [[ "${value}" != @* || "${value}" == @- ]]; then
              printf '%s\n' 'Relution curl requires one --data-binary @file request body.' >&2
              return 2
            fi
            data_seen=1
            ;;
          --output|--dump-header)
            if [[ -z "${value}" || "${value}" == - || "${value}" == -* || \
                  "${value}" == *$'\n'* || "${value}" == *$'\r'* ]]; then
              printf '%s\n' 'Relution curl requires a file path for evidence output.' >&2
              return 2
            fi
            ;;
          --write-out)
            if [[ "${value}" != '%{http_code}' ]]; then
              printf '%s\n' 'Relution curl only permits the HTTP status write-out template.' >&2
              return 2
            fi
            ;;
        esac
        curl_arguments+=("${option}" "${value}")
        ;;
      --connect-timeout=*|--max-time=*|--request=*|--header=*|--data-binary=*|--output=*|--dump-header=*|--write-out=*|--*)
        printf '%s\n' 'Relution curl rejected an unsafe or ambiguous curl option.' >&2
        return 2
        ;;
      -*)
        # Short-option bundles (for example, -vk) are deliberately forbidden:
        # their semantics can change when curl gains or changes short options.
        printf '%s\n' 'Relution curl rejected an unsafe or ambiguous curl option.' >&2
        return 2
        ;;
      *)
        if [[ -n "${request_url}" ]]; then
          printf '%s\n' 'Relution curl requires exactly one request URL.' >&2
          return 2
        fi
        request_url="${option}"
        ;;
    esac
  done

  local request_remainder request_authority request_path_and_query request_path
  if [[ -z "${request_url}" || "${request_url}" != https://* || \
        "${request_url}" == *\#* || "${request_url}" == *@* || \
        "${request_url}" == *$'\n'* || "${request_url}" == *$'\r'* || \
        "${request_url}" == *' '* || "${request_url}" == *$'\t'* || \
        "${request_url}" == *\\* || "${request_url}" == *"${RELUTION_API_TOKEN}"* ]]; then
    printf '%s\n' 'Relution curl requires exactly one HTTPS request URL.' >&2
    return 2
  fi
  request_remainder="${request_url#https://}"
  request_authority="${request_remainder%%/*}"
  request_path_and_query="${request_remainder#${request_authority}}"
  request_path="${request_path_and_query%%\?*}"
  if [[ "${request_authority}" != "${server_authority}" || \
        -z "${request_path}" || "${request_path}" != /* || \
        "${request_path}" == *'//'* || "${request_path}" == */./* || \
        "${request_path}" == */../* || "${request_path}" == */. || \
        "${request_path}" == */.. || "${request_path}" == *'%'* ]]; then
    printf '%s\n' 'Relution curl rejected a URL outside RELUTION_API_SERVER.' >&2
    return 2
  fi
  if [[ -n "${server_base}" && "${request_path}" != "${server_base}" && \
        "${request_path}" != "${server_base}"/* ]]; then
    printf '%s\n' 'Relution curl rejected a URL outside RELUTION_API_SERVER.' >&2
    return 2
  fi

  local escaped_token="${RELUTION_API_TOKEN//\\/\\\\}"
  escaped_token="${escaped_token//\"/\\\"}"
  local auth_config="header = \"X-User-Access-Token: ${escaped_token}\""

  # zsh's print is a builtin, so the secret moves through a pipe rather than a
  # process argument, exported environment variable, persistent file, or
  # disk-backed here-string.  --disable blocks ambient curl configuration;
  # --globoff and --noproxy '*' ensure one pinned destination without proxy
  # rerouting.  User-provided curl options are restricted above.
  print -r -- "${auth_config}" | command curl --disable --config - --globoff --noproxy '*' \
    "${curl_arguments[@]}" "${request_url}"
}
