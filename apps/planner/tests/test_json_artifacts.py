from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from campusweave.json_snapshot import load_strict_json
from campusweave.private_artifacts import atomic_write_json, load_json_beneath, strict_load_json


class JsonAndArtifactTests(unittest.TestCase):
    def test_strict_json_rejects_duplicate_keys_and_non_finite_values(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            duplicate = Path(directory) / "duplicate.json"
            duplicate.write_text('{"safe": true, "safe": false}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
                load_strict_json(duplicate)
            non_finite = Path(directory) / "non-finite.json"
            non_finite.write_text('{"value": NaN}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "non-standard JSON constant"):
                load_strict_json(non_finite)

    def test_private_write_is_non_overwriting_and_artifact_reads_stay_beneath_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "private"
            root.mkdir(mode=0o700)
            path = root / "plan.json"
            atomic_write_json(path, {"safe": True})
            self.assertEqual(strict_load_json(path, private=True), {"safe": True})
            with self.assertRaisesRegex(ValueError, "already exists"):
                atomic_write_json(path, {"safe": False})

            outside = Path(directory) / "outside.json"
            outside.write_text('{"secret": false}', encoding="utf-8")
            (root / "linked.json").symlink_to(outside)
            with self.assertRaisesRegex(ValueError, "traversal-free"):
                load_json_beneath(root, "../outside.json")
            with self.assertRaisesRegex(ValueError, "without following symlinks"):
                load_json_beneath(root, "linked.json")

    def test_atomic_write_link_failure_cleans_up_without_closing_twice(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            with (
                patch("campusweave.private_artifacts.os.link", side_effect=OSError("link failed")),
                patch("campusweave.private_artifacts.os.close", wraps=os.close) as close,
                self.assertRaisesRegex(OSError, "link failed"),
            ):
                atomic_write_json(path, {"safe": True})

            self.assertFalse(path.exists())
            self.assertEqual(list(path.parent.glob(f".{path.name}.*")), [])
            close.assert_not_called()

    def test_artifact_reads_fail_closed_without_no_follow_support(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.json"
            output = Path(directory) / "output.json"
            path.write_text('{"safe": true}', encoding="utf-8")
            with patch("campusweave.private_artifacts.os.O_NOFOLLOW", None):
                with self.assertRaisesRegex(RuntimeError, "requires POSIX os.O_NOFOLLOW"):
                    strict_load_json(path)
                with self.assertRaisesRegex(RuntimeError, "requires POSIX os.O_NOFOLLOW"):
                    load_strict_json(path)
                with self.assertRaisesRegex(RuntimeError, "requires POSIX os.O_NOFOLLOW"):
                    atomic_write_json(output, {"safe": True})
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
