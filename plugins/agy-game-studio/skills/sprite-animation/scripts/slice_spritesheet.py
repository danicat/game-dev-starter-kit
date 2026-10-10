#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "pillow>=10.0.0",
# ]
# ///
"""Deterministic sprite sheet validator, grid slicer, and Aseprite JSON manifest exporter."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from PIL import Image


VALID_DIRECTIONS = {"forward", "reverse", "pingpong", "pingpong_reverse"}


def fail(msg: str) -> None:
    print(f"ERROR [slice_spritesheet]: {msg}", file=sys.stderr)
    sys.exit(1)


def parse_tag(spec: str, total_frames: int, default_duration_ms: int) -> dict:
    """Parse tag specification 'name:from:to[:duration_ms[:direction]]'."""
    parts = spec.split(":")
    if len(parts) < 3 or len(parts) > 5:
        fail(
            f"invalid --tag '{spec}': expected format 'name:start_frame:end_frame[:duration_ms[:direction]]'"
        )
    name = parts[0].strip()
    if not name:
        fail(f"invalid --tag '{spec}': tag name must not be empty")
    try:
        start_frame = int(parts[1])
        end_frame = int(parts[2])
    except ValueError as exc:
        fail(f"invalid --tag '{spec}': start_frame and end_frame must be integers ({exc})")

    if start_frame < 0 or end_frame < start_frame or end_frame >= total_frames:
        fail(
            f"invalid --tag '{spec}': frame range [{start_frame}, {end_frame}] out of bounds [0, {total_frames - 1}]"
        )

    duration_ms = default_duration_ms
    if len(parts) >= 4 and parts[3]:
        try:
            duration_ms = int(parts[3])
        except ValueError as exc:
            fail(f"invalid --tag '{spec}': duration_ms must be an integer ({exc})")
        if duration_ms <= 0:
            fail(f"invalid --tag '{spec}': duration_ms ({duration_ms}) must be > 0")

    direction = "forward"
    if len(parts) == 5 and parts[4]:
        direction = parts[4].strip().lower()
        if direction not in VALID_DIRECTIONS:
            fail(
                f"invalid --tag '{spec}': unknown direction '{direction}' (valid: {sorted(VALID_DIRECTIONS)})"
            )

    return {
        "name": name,
        "from": start_frame,
        "to": end_frame,
        "direction": direction,
        "duration_ms": duration_ms,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate a sprite sheet PNG against frame dimensions, slice grid cells, and export an Aseprite-compatible JSON manifest."
    )
    parser.add_argument("input", type=Path, help="Path to source sprite sheet PNG file")
    parser.add_argument(
        "--frame-width", type=int, required=True, help="Width of each frame cell in pixels (> 0)"
    )
    parser.add_argument(
        "--frame-height", type=int, required=True, help="Height of each frame cell in pixels (> 0)"
    )
    parser.add_argument(
        "--duration-ms",
        type=int,
        default=100,
        help="Default frame duration in milliseconds (default: 100)",
    )
    parser.add_argument(
        "--tag",
        action="append",
        default=[],
        help="Animation tag spec 'name:start:end[:duration_ms[:direction]]' (repeatable)",
    )
    parser.add_argument(
        "--output-json",
        type=Path,
        default=None,
        help="Output path for Aseprite-compatible JSON manifest (default: <input_stem>.json)",
    )
    parser.add_argument(
        "--export-frames-dir",
        type=Path,
        default=None,
        help="Optional directory to export individual sliced frame PNGs",
    )

    args = parser.parse_args()

    if not args.input.is_file():
        fail(f"input sprite sheet not found: {args.input}")
    if args.frame_width <= 0 or args.frame_height <= 0:
        fail(
            f"--frame-width ({args.frame_width}) and --frame-height ({args.frame_height}) must be > 0"
        )
    if args.duration_ms <= 0:
        fail(f"--duration-ms ({args.duration_ms}) must be > 0")

    try:
        with Image.open(args.input) as raw_img:
            raw_img.verify()
        with Image.open(args.input) as img:
            rgba_img = img.convert("RGBA")
            sheet_w, sheet_h = rgba_img.size

            if sheet_w <= 0 or sheet_h <= 0:
                fail(f"sprite sheet '{args.input}' has invalid dimensions {sheet_w}x{sheet_h}")

            if sheet_w % args.frame_width != 0 or sheet_h % args.frame_height != 0:
                fail(
                    f"sprite sheet '{args.input}' dimensions ({sheet_w}x{sheet_h}) are not evenly divisible "
                    f"by frame size ({args.frame_width}x{args.frame_height}): "
                    f"remainder=({sheet_w % args.frame_width}, {sheet_h % args.frame_height})"
                )

            cols = sheet_w // args.frame_width
            rows = sheet_h // args.frame_height
            total_frames = cols * rows

            parsed_tags = [
                parse_tag(t, total_frames, args.duration_ms) for t in args.tag
            ]

            frame_durations = [args.duration_ms] * total_frames
            for t in parsed_tags:
                for idx in range(t["from"], t["to"] + 1):
                    frame_durations[idx] = t["duration_ms"]

            if args.export_frames_dir is not None:
                args.export_frames_dir.mkdir(parents=True, exist_ok=True)

            frames_manifest: list[dict] = []
            stem = args.input.stem

            for idx in range(total_frames):
                col = idx % cols
                row = idx // cols
                x0 = col * args.frame_width
                y0 = row * args.frame_height
                box = (x0, y0, x0 + args.frame_width, y0 + args.frame_height)

                if args.export_frames_dir is not None:
                    cell = rgba_img.crop(box)
                    frame_path = args.export_frames_dir / f"{stem}_{idx:03d}.png"
                    cell.save(frame_path, format="PNG")

                frames_manifest.append(
                    {
                        "filename": f"{stem} #{idx}",
                        "frame": {
                            "x": x0,
                            "y": y0,
                            "w": args.frame_width,
                            "h": args.frame_height,
                        },
                        "rotated": False,
                        "trimmed": False,
                        "spriteSourceSize": {
                            "x": 0,
                            "y": 0,
                            "w": args.frame_width,
                            "h": args.frame_height,
                        },
                        "sourceSize": {
                            "w": args.frame_width,
                            "h": args.frame_height,
                        },
                        "duration": frame_durations[idx],
                    }
                )
    except Exception as exc:
        if isinstance(exc, SystemExit):
            raise
        fail(f"failed to process sprite sheet '{args.input}': {exc}")

    frame_tags_manifest = [
        {
            "name": t["name"],
            "from": t["from"],
            "to": t["to"],
            "direction": t["direction"],
        }
        for t in parsed_tags
    ]

    manifest = {
        "frames": frames_manifest,
        "meta": {
            "app": "https://skills.danicat.dev/sprite-animation",
            "version": "0.3.0",
            "image": args.input.name,
            "format": "RGBA8888",
            "size": {"w": sheet_w, "h": sheet_h},
            "scale": "1",
            "grid": {
                "columns": cols,
                "rows": rows,
                "frameWidth": args.frame_width,
                "frameHeight": args.frame_height,
                "totalFrames": total_frames,
            },
            "frameTags": frame_tags_manifest,
            "layers": [{"name": "Base", "opacity": 255, "blendMode": "normal"}],
            "slices": [],
        },
    }

    output_json = args.output_json or args.input.with_suffix(".json")
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(
        f"OK: validated {args.input.name} ({sheet_w}x{sheet_h}) -> "
        f"{cols}x{rows} grid ({total_frames} frames @ {args.frame_width}x{args.frame_height}), "
        f"manifest written to {output_json}"
    )


if __name__ == "__main__":
    main()
