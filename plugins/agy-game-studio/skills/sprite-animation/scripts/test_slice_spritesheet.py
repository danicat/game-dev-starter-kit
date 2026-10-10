#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "pillow>=10.0.0",
#   "pytest>=7.0.0",
# ]
# ///
"""Unit tests for slice_spritesheet.py."""

import json
import subprocess
import sys
from pathlib import Path
from PIL import Image

SCRIPT_PATH = Path(__file__).parent / "slice_spritesheet.py"


def test_slice_valid_spritesheet(tmp_path: Path):
    sheet_path = tmp_path / "hero_sheet.png"
    img = Image.new("RGBA", (128, 64), (255, 0, 0, 255))
    img.save(sheet_path)

    out_json = tmp_path / "hero_sheet.json"
    frames_dir = tmp_path / "frames"

    res = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            str(sheet_path),
            "--frame-width",
            "32",
            "--frame-height",
            "32",
            "--tag",
            "idle:0:3:120:forward",
            "--tag",
            "run:4:7:80:pingpong",
            "--output-json",
            str(out_json),
            "--export-frames-dir",
            str(frames_dir),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    assert "4x2 grid (8 frames @ 32x32)" in res.stdout
    assert out_json.is_file()
    data = json.loads(out_json.read_text(encoding="utf-8"))
    assert len(data["frames"]) == 8
    assert len(data["meta"]["frameTags"]) == 2
    assert data["meta"]["frameTags"][0]["name"] == "idle"
    assert data["frames"][0]["duration"] == 120
    assert data["frames"][4]["duration"] == 80
    assert len(list(frames_dir.glob("*.png"))) == 8


def test_slice_fails_fast_on_indivisible_dimensions(tmp_path: Path):
    sheet_path = tmp_path / "bad_sheet.png"
    img = Image.new("RGBA", (100, 64), (0, 255, 0, 255))
    img.save(sheet_path)

    res = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            str(sheet_path),
            "--frame-width",
            "32",
            "--frame-height",
            "32",
        ],
        capture_output=True,
        text=True,
    )
    assert res.returncode != 0
    assert "not evenly divisible" in res.stderr


def test_slice_fails_fast_on_invalid_tag_bounds(tmp_path: Path):
    sheet_path = tmp_path / "tag_sheet.png"
    img = Image.new("RGBA", (64, 32), (0, 0, 255, 255))
    img.save(sheet_path)

    res = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            str(sheet_path),
            "--frame-width",
            "32",
            "--frame-height",
            "32",
            "--tag",
            "walk:0:5:100",
        ],
        capture_output=True,
        text=True,
    )
    assert res.returncode != 0
    assert "out of bounds" in res.stderr
