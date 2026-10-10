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

import subprocess
import sys
import os

def test_lyria_help():
    script_path = os.path.join(os.path.dirname(__file__), "lyria.py")
    cmd = ["uv", "run", script_path, "--help"] if os.system("which uv > /dev/null 2>&1") == 0 else [sys.executable, script_path, "--help"]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    assert "--prompt" in result.stdout or "-p" in result.stdout
    assert "--model" in result.stdout or "-m" in result.stdout
    assert "lyria-3.5" in result.stdout
    assert "lyria-3-pro-preview" in result.stdout
    assert "lyria-3-clip" in result.stdout
    assert "lyria-3-clip-preview" in result.stdout
    assert "--format" in result.stdout
    assert "--lyrics-file" in result.stdout
    assert "--api" in result.stdout
    print("Test passed: lyria.py --help includes all expected flags and model aliases.")

def test_input_limits():
    script_path = os.path.join(os.path.dirname(__file__), "lyria.py")
    cmd_base = ["uv", "run", script_path] if os.system("which uv > /dev/null 2>&1") == 0 else [sys.executable, script_path]
    # Test more than 10 input images
    args = ["-p", "test", "-f", "out.mp3"]
    for i in range(11):
        args.extend(["-i", f"img_{i}.png"])
    res = subprocess.run(cmd_base + args, capture_output=True, text=True)
    assert res.returncode != 0
    assert "Maximum of 10 input images allowed" in res.stderr
    print("Test passed: Input image limit enforced.")

def test_fail_fast_missing_credentials():
    script_path = os.path.join(os.path.dirname(__file__), "lyria.py")
    cmd_base = ["uv", "run", script_path] if os.system("which uv > /dev/null 2>&1") == 0 else [sys.executable, script_path]
    env = dict(os.environ)
    env.pop("GEMINI_API_KEY", None)
    env.pop("GOOGLE_GENAI_USE_VERTEXAI", None)
    res = subprocess.run(cmd_base + ["-p", "test", "-m", "lyria-3.5"], capture_output=True, text=True, env=env)
    assert res.returncode != 0
    assert "GEMINI_API_KEY" in res.stderr
    print("Test passed: Missing credentials fail fast without silent fallback.")

if __name__ == "__main__":
    test_lyria_help()
    test_input_limits()
    test_fail_fast_missing_credentials()
    print("All lyria CLI tests passed successfully!")
