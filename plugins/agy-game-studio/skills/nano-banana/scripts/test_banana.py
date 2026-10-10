# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import shutil
import subprocess
import sys

SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "banana.py")
CMD_BASE = ["uv", "run", SCRIPT_PATH] if shutil.which("uv") else [sys.executable, SCRIPT_PATH]


def run_cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(CMD_BASE + list(args), capture_output=True, text=True)


def test_banana_help():
    result = run_cli("--help")
    assert result.returncode == 0
    assert "--prompt" in result.stdout or "-p" in result.stdout
    assert "--aspect-ratio" in result.stdout or "-a" in result.stdout
    assert "--resolution" in result.stdout or "-r" in result.stdout
    assert "--thinking-level" in result.stdout
    assert "--search" in result.stdout
    assert "--image-search" in result.stdout
    assert "--api" in result.stdout
    assert "nano-banana-2.1" in result.stdout
    assert "nano-banana-2-1" in result.stdout
    assert "medium" in result.stdout


def test_nano_banana_2_1_capabilities():
    # Test nano-banana-2.1 (and alias nano-banana-2-1) mapping to gemini-nano-banana-2.1
    # across 512px, 2K, 4K resolutions, 1:4 and 8:1 aspect ratios, --image-search, and --thinking-level medium
    for alias in ("nano-banana-2.1", "nano-banana-2-1"):
        for res, ratio in (("512px", "1:4"), ("2K", "8:1"), ("4K", "16:9")):
            result = run_cli(
                "-p", "test prompt",
                "-f", "out.png",
                "-m", alias,
                "-r", res,
                "-a", ratio,
                "--image-search",
                "--thinking-level", "medium",
                "--dry-run",
            )
            assert result.returncode == 0, f"Unexpected failure for {alias} {res} {ratio}: {result.stderr}"
            assert f"Model: gemini-nano-banana-2.1 ({alias})" in result.stdout
            assert f"Resolution: {res} | Aspect Ratio: {ratio}" in result.stdout


def test_capability_validation_guards():
    # 1. Nano Banana 2 Lite rejecting 2K and 4K resolutions and 512px
    for invalid_res in ("2K", "4K", "512px"):
        res = run_cli("-p", "test", "-f", "out.png", "-m", "nano-banana-2-lite", "-r", invalid_res, "--dry-run")
        assert res.returncode != 0
        assert invalid_res in res.stderr

    # 2. Search grounding and Image Search rejected on nano-banana-2-lite
    res = run_cli("-p", "test", "-f", "out.png", "-m", "nano-banana-2-lite", "--search", "--dry-run")
    assert res.returncode != 0
    assert "Search grounding is not supported by nano-banana-2-lite" in res.stderr

    res = run_cli("-p", "test", "-f", "out.png", "-m", "nano-banana-2-lite", "--image-search", "--dry-run")
    assert res.returncode != 0
    assert "Search grounding is not supported by nano-banana-2-lite" in res.stderr

    # 3. Thinking level 'medium' rejected on nano-banana-2-lite and nano-banana-2
    for model in ("nano-banana-2-lite", "nano-banana-2"):
        res = run_cli("-p", "test", "-f", "out.png", "-m", model, "--thinking-level", "medium", "--dry-run")
        assert res.returncode != 0
        assert "Thinking level 'medium' is only supported by 'nano-banana-2.1'" in res.stderr

    # 4. Extended aspect ratios (1:4, 8:1) and --image-search rejected on nano-banana-pro
    for ratio in ("1:4", "8:1"):
        res = run_cli("-p", "test", "-f", "out.png", "-m", "nano-banana-pro", "-a", ratio, "--dry-run")
        assert res.returncode != 0
        assert f"Aspect ratio '{ratio}' is only supported by" in res.stderr

    res = run_cli("-p", "test", "-f", "out.png", "-m", "nano-banana-pro", "--image-search", "--dry-run")
    assert res.returncode != 0
    assert "Google Image Search Grounding (--image-search) is only supported by" in res.stderr


def test_deprecated_nano_banana_v1_removed():
    # Legacy 'nano-banana' (gemini-2.5-flash-image) must be rejected immediately
    res = run_cli("-p", "test", "-f", "out.png", "-m", "nano-banana", "--dry-run")
    assert res.returncode != 0
    assert "invalid choice: 'nano-banana'" in res.stderr


if __name__ == "__main__":
    test_banana_help()
    test_nano_banana_2_1_capabilities()
    test_capability_validation_guards()
    test_deprecated_nano_banana_v1_removed()
    print("All banana CLI v0.3.0 tests passed successfully!")
