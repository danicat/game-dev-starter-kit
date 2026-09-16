# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "google-genai",
#     "pillow",
#     "google-auth",
# ]
# ///

import argparse
import sys
import os
import google.auth
from google import genai
from google.genai import types
from PIL import Image
from google.genai.errors import APIError

MODEL_MAP = {
    "nano-banana": "gemini-2.5-flash-image",
    "nano-banana-pro": "gemini-3-pro-image",
    "nano-banana-2": "gemini-3.1-flash-image",
    "nano-banana-2-lite": "gemini-3.1-flash-lite-image",
    "nano-banana-lite": "gemini-3.1-flash-lite-image",
}

def main():
    parser = argparse.ArgumentParser(description="Generate or edit images using Nano Banana models.")
    parser.add_argument("-p", "--prompt", required=True, help="Text prompt describing the image")
    parser.add_argument("-f", "--filename", required=True, help="Output image filename")
    parser.add_argument("-i", "--input-image", action="append", default=[], help="Path to input/reference image(s) (up to 14)")
    parser.add_argument("-m", "--model", choices=["nano-banana", "nano-banana-pro", "nano-banana-2", "nano-banana-2-lite", "nano-banana-lite"], default="nano-banana-2-lite", help="Model selection (default: nano-banana-2-lite)")
    parser.add_argument("-r", "--resolution", choices=["1K", "2K", "4K"], default="1K", help="Output resolution")
    parser.add_argument("--project", help="GCP Project ID for Vertex AI")
    parser.add_argument("--location", default="global", help="GCP Location for Vertex AI (default: global)")
    
    args = parser.parse_args()
    
    if len(args.input_image) > 14:
        print("Error: Maximum of 14 input images allowed.", file=sys.stderr)
        sys.exit(1)
        
    model_id = MODEL_MAP[args.model]
    
    # Always use ADC via google.auth.default() for Vertex AI
    try:
        credentials, default_project = google.auth.default()
    except Exception as e:
        credentials = None
        default_project = None

    project = (
        args.project
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCP_PROJECT")
        or default_project
    )
    location = args.location or os.environ.get("GOOGLE_CLOUD_LOCATION", "global")

    if not project:
        print("Error: Could not determine GCP Project ID from ADC or environment variables (GOOGLE_CLOUD_PROJECT / GCP_PROJECT). Please run 'gcloud auth application-default login' or pass --project.", file=sys.stderr)
        sys.exit(1)

    client = genai.Client(vertexai=True, project=project, location=location, credentials=credentials)
        
    print(f"Model: {model_id}")
    print(f"Output: {args.filename}")
    print(f"Inputs: {args.input_image}")
    
    inputs = []
    for img_path in args.input_image:
        inputs.append(Image.open(img_path))

    contents = [args.prompt] + inputs if inputs else args.prompt

    try:
        response = client.models.generate_content(
            model=model_id,
            contents=contents
        )
        img_bytes = None
        for part in response.candidates[0].content.parts:
            if part.inline_data:
                img_bytes = part.inline_data.data
                break
        if not img_bytes:
            raise ValueError("No image data found in response candidates.")

        with open(args.filename, "wb") as f:
            f.write(img_bytes)
            
        print(f"Success! Image saved to {args.filename}")
    except APIError as e:
        print(f"API Error generating image with {model_id}: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error generating image with {model_id}: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        with open(args.filename, "wb") as f:
            f.write(img_bytes)
            
        print(f"Success! Image saved to {args.filename}")
    except Exception as e:
        print(f"Error saving image: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
