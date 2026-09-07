"""macOS terminal-method parsing for CIS helper fallbacks."""
from __future__ import annotations

from _harvest_cis_benchmarks_modules.cis_text_collections import normalize_space, unique_preserving_order
from _harvest_cis_benchmarks_modules.cis_text_commands import is_terminal_stop_line, trim_at_markers
from _harvest_cis_benchmarks_modules.cis_parser_constants import MACOS_METHOD_LABEL_RE, TERMINAL_COMMAND_STOP_MARKERS

def split_macos_method_blocks(remediation_lines: list[str]) -> list[dict[str, str]]:
    """Split macOS remediation text into graphical, terminal, and profile blocks."""
    text = "\n".join(line for line in remediation_lines if line)
    matches = list(MACOS_METHOD_LABEL_RE.finditer(text))
    blocks: list[dict[str, str]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        raw_text = text[match.end() : end].strip()
        if not raw_text:
            continue
        blocks.append(
            {
                "label": match.group(1).removesuffix(":"),
                "text": normalize_space(raw_text),
                "rawText": raw_text,
            }
        )
    return blocks


def extract_terminal_commands(raw_text: str) -> list[str]:
    """Extract shell commands from CIS terminal-method remediation text."""
    commands: list[str] = []
    current_command: str | None = None
    for line in raw_text.splitlines():
        stripped = line.strip()
        if not stripped:
            if current_command is not None:
                commands.append(
                    trim_at_markers(
                        current_command.strip(), TERMINAL_COMMAND_STOP_MARKERS
                    ).strip()
                )
                current_command = None
            continue
        if "% " in stripped:
            if current_command is not None:
                commands.append(
                    trim_at_markers(
                        current_command.strip(), TERMINAL_COMMAND_STOP_MARKERS
                    ).strip()
                )
            current_command = stripped.split("% ", 1)[1].strip()
            continue
        if current_command is None:
            continue
        if is_terminal_stop_line(stripped):
            commands.append(
                trim_at_markers(
                    current_command.strip(), TERMINAL_COMMAND_STOP_MARKERS
                ).strip()
            )
            current_command = None
            continue
        current_command = f"{current_command} {stripped}".strip()
    if current_command is not None:
        commands.append(
            trim_at_markers(
                current_command.strip(), TERMINAL_COMMAND_STOP_MARKERS
            ).strip()
        )
    return unique_preserving_order(commands)
