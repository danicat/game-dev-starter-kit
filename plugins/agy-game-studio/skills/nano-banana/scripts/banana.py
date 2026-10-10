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

# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "google-genai>=2.3.0",
#     "pillow>=10.0.0",
#     "google-auth>=2.0.0",
# ]
# ///

import argparse
import base64
import os
import sys
from PIL import Image
import google.auth
from google import genai
from google.genai import types
from google.genai.errors import APIError

MODEL_MAP = {
    "nano-banana-2.1": "gemini-nano-banana-2.1",
    "nano-banana-2-1": "gemini-nano-banana-2.1",
    "nano-banana-2": "gemini-3.1-flash-image",
    "nano-banana-2-lite": "gemini-3.1-flash-lite-image",
    "nano-banana-lite": "gemini-3.1-flash-lite-image",
    "nano-banana-pro": "gemini-3-pro-image",
}

VALID_ASPECT_RATIOS = [
    "1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3",
    "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"
]

EXTENDED_ASPECT_RATIOS = {"1:4", "4:1", "1:8", "8:1"}

def validate_capabilities(args, model_id):
    """Validate requested CLI arguments against model capability constraints."""
    # Input images limit
    if len(args.input_image) > 14:
        print("Error: Maximum of 14 input/reference images allowed.", file=sys.stderr)
        sys.exit(1)

    # Resolution validation
    if args.resolution in ["2K", "4K"]:
        if model_id == "gemini-3.1-flash-lite-image":
            print(
                f"Error: Resolution '{args.resolution}' is not supported by {args.model}. "
                "2K and 4K output requires 'nano-banana-2.1', 'nano-banana-2', or 'nano-banana-pro'.",
                file=sys.stderr
            )
            sys.exit(1)

    if args.resolution == "512px" and model_id not in ["gemini-nano-banana-2.1", "gemini-3.1-flash-image"]:
        print(
            "Error: Resolution '512px' is only supported by 'nano-banana-2.1' (gemini-nano-banana-2.1) "
            "and 'nano-banana-2' (gemini-3.1-flash-image).",
            file=sys.stderr
        )
        sys.exit(1)

    # Aspect ratio validation
    if args.aspect_ratio in EXTENDED_ASPECT_RATIOS:
        if model_id not in ["gemini-nano-banana-2.1", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"]:
            print(
                f"Error: Aspect ratio '{args.aspect_ratio}' is only supported by "
                "'nano-banana-2.1', 'nano-banana-2', and 'nano-banana-2-lite'.",
                file=sys.stderr
            )
            sys.exit(1)

    # Search Grounding validation
    if args.search or args.image_search:
        if model_id == "gemini-3.1-flash-lite-image":
            print(
                f"Error: Search grounding is not supported by {args.model}. "
                "Use 'nano-banana-2.1', 'nano-banana-2', or 'nano-banana-pro' for Google Search grounding.",
                file=sys.stderr
            )
            sys.exit(1)

    if args.image_search and model_id not in ["gemini-nano-banana-2.1", "gemini-3.1-flash-image"]:
        print(
            "Error: Google Image Search Grounding (--image-search) is only supported by "
            "'nano-banana-2.1' and 'nano-banana-2'.",
            file=sys.stderr
        )
        sys.exit(1)

    # Thinking level validation
    if args.thinking_level == "medium" and model_id != "gemini-nano-banana-2.1":
        print(
            f"Error: Thinking level 'medium' is only supported by 'nano-banana-2.1' (gemini-nano-banana-2.1), "
            f"not {args.model}.",
            file=sys.stderr
        )
        sys.exit(1)

def init_client(args):
    """Initialize Google GenAI Client with ADC or API Key."""
    api_key = os.environ.get("GEMINI_API_KEY")
    use_vertex = (
        args.project is not None
        or os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() in ("true", "1")
        or (not api_key and os.environ.get("GOOGLE_CLOUD_PROJECT"))
    )

    if use_vertex:
        credentials, default_project = google.auth.default()
        project = (
            args.project
            or os.environ.get("GOOGLE_CLOUD_PROJECT")
            or os.environ.get("GCP_PROJECT")
            or default_project
        )
        location = args.location or os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

        if not project:
            print(
                "Error: Vertex AI requested or inferred, but no GCP Project ID found. "
                "Set GEMINI_API_KEY for Google AI Studio, or configure ADC via 'gcloud auth application-default login'.",
                file=sys.stderr
            )
            sys.exit(1)

        return genai.Client(vertexai=True, project=project, location=location, credentials=credentials)

    if not api_key:
        print(
            "Error: GEMINI_API_KEY environment variable is not set and Vertex AI is not configured. "
            "Set GEMINI_API_KEY or pass --project / GOOGLE_CLOUD_PROJECT for Vertex AI.",
            file=sys.stderr
        )
        sys.exit(1)

    return genai.Client(api_key=api_key)

def main():
    parser = argparse.ArgumentParser(
        description="Generate, edit, and transform images using Google Nano Banana foundation models."
    )
    parser.add_argument("-p", "--prompt", required=True, help="Text prompt describing the image to generate or edit")
    parser.add_argument("-f", "--filename", required=True, help="Output image filename (e.g. output.png)")
    parser.add_argument("-i", "--input-image", action="append", default=[], help="Path to input/reference image(s) (up to 14)")
    parser.add_argument(
        "-m", "--model",
        choices=[
            "nano-banana-2.1",
            "nano-banana-2-1",
            "nano-banana-2",
            "nano-banana-2-lite",
            "nano-banana-lite",
            "nano-banana-pro",
        ],
        default="nano-banana-2.1",
        help="Model selection (default: nano-banana-2.1)"
    )
    parser.add_argument(
        "-r", "--resolution",
        choices=["512px", "1K", "2K", "4K"],
        default="1K",
        help="Output resolution (default: 1K)"
    )
    parser.add_argument(
        "-a", "--aspect-ratio",
        choices=VALID_ASPECT_RATIOS,
        default="1:1",
        help="Output aspect ratio (default: 1:1)"
    )
    parser.add_argument(
        "--thinking-level",
        choices=["minimal", "medium", "high"],
        help="Thinking process level: minimal, medium (Nano Banana 2.1 only), or high"
    )
    parser.add_argument(
        "--search",
        action="store_true",
        help="Enable Google Search grounding (Banana 2.1, Banana 2, and Banana Pro)"
    )
    parser.add_argument(
        "--image-search",
        action="store_true",
        help="Enable Google Image Search grounding (Banana 2.1 and Banana 2)"
    )
    parser.add_argument(
        "--api",
        choices=["interactions", "models"],
        default="interactions",
        help="Underlying API method: 'interactions' (Interactions API, default) or 'models' (generate_content)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate model capabilities and configuration without calling the API"
    )
    parser.add_argument("--project", help="GCP Project ID for Vertex AI")
    parser.add_argument("--location", default="us-central1", help="GCP Location for Vertex AI (default: us-central1)")

    args = parser.parse_args()
    model_id = MODEL_MAP[args.model]

    validate_capabilities(args, model_id)

    print(f"Model: {model_id} ({args.model})")
    print(f"Resolution: {args.resolution} | Aspect Ratio: {args.aspect_ratio}")
    if args.input_image:
        print(f"Reference Images ({len(args.input_image)}): {args.input_image}")
    print(f"Output: {args.filename}")

    if args.dry_run:
        print("Dry run validation succeeded.")
        return

    client = init_client(args)

    try:
        if args.api == "interactions":
            # Build Interactions API payload
            response_format = {
                "type": "image",
                "aspect_ratio": args.aspect_ratio,
                "image_size": args.resolution,
            }

            tools = []
            if args.image_search:
                tools.append({"type": "google_search", "search_types": ["web_search", "image_search"]})
            elif args.search:
                tools.append({"type": "google_search"})

            generation_config = {}
            if args.thinking_level:
                generation_config["thinking_level"] = args.thinking_level

            if args.input_image:
                input_payload = []
                for img_path in args.input_image:
                    mime = "image/png"
                    lower_path = img_path.lower()
                    if lower_path.endswith((".jpg", ".jpeg")):
                        mime = "image/jpeg"
                    elif lower_path.endswith(".webp"):
                        mime = "image/webp"

                    with open(img_path, "rb") as f:
                        b64_data = base64.b64encode(f.read()).decode("utf-8")
                    input_payload.append({"type": "image", "data": b64_data, "mime_type": mime})
                input_payload.append({"type": "text", "text": args.prompt})
            else:
                input_payload = args.prompt

            kwargs = {
                "model": model_id,
                "input": input_payload,
                "response_format": response_format,
            }
            if tools:
                kwargs["tools"] = tools
            if generation_config:
                kwargs["generation_config"] = generation_config

            interaction = client.interactions.create(**kwargs)

            img_bytes = None
            if interaction.output_image and interaction.output_image.data:
                img_bytes = base64.b64decode(interaction.output_image.data)
            else:
                for step in getattr(interaction, "steps", []):
                    if step.type == "model_output":
                        for block in getattr(step, "content", []):
                            if getattr(block, "type", "") == "image" and getattr(block, "data", None):
                                img_bytes = base64.b64decode(block.data)
                                break

            if not img_bytes:
                raise ValueError("No image returned from Interactions API response.")

            with open(args.filename, "wb") as f:
                f.write(img_bytes)

        else:
            # Models API (generate_content)
            contents = []
            for img_path in args.input_image:
                contents.append(Image.open(img_path))
            contents.append(args.prompt)

            response = client.models.generate_content(
                model=model_id,
                contents=contents
            )

            img_bytes = None
            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if part.inline_data and part.inline_data.data:
                        img_bytes = part.inline_data.data
                        break

            if not img_bytes:
                raise ValueError("No image data found in generate_content response candidates.")

            with open(args.filename, "wb") as f:
                f.write(img_bytes)

        print(f"Success! Image saved to {args.filename}")

    except APIError as e:
        print(f"API Error generating image with {model_id}: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error generating image with {model_id}: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
