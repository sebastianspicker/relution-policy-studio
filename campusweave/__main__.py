"""Start the local-only CampusWeave service."""

from __future__ import annotations

from .service import create_server


def main() -> int:
    with create_server() as server:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
