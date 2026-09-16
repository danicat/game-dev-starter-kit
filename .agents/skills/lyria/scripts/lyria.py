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
import base64
import google.auth
from google import genai
from google.genai.errors import APIError
from PIL import Image

MODEL_MAP = {
    "lyria-3-clip-preview": "lyria-3-clip-preview",
    "lyria-3-pro-preview": "lyria-3-pro-preview",
    "clip": "lyria-3-clip-preview",
    "pro": "lyria-3-pro-preview",
    "lyria-clip": "lyria-3-clip-preview",
    "lyria-pro": "lyria-3-pro-preview",
}

def main():
    parser = argparse.ArgumentParser(description="Generate music using Lyria 3 models.")
    parser.add_argument("-p", "--prompt", required=True, help="Text prompt describing the music to generate")
    parser.add_argument("-f", "--filename", default="music.mp3", help="Output audio filename (default: music.mp3)")
    parser.add_argument("-m", "--model", choices=list(MODEL_MAP.keys()), default="lyria-3-pro-preview", help="Model selection (clip vs pro)")
    parser.add_argument("-i", "--input-image", action="append", default=[], help="Path to input image(s) for multimodal music (up to 10)")
    parser.add_argument("--format", choices=["mp3", "wav"], default="mp3", help="Audio output format (mp3 or wav)")
    parser.add_argument("--lyrics-file", help="Path to save generated lyrics / song structure text")
    parser.add_argument("--project", help="GCP Project ID for Vertex AI")
    parser.add_argument("--location", default="us-central1", help="GCP Location for Vertex AI")

    args = parser.parse_args()

    if len(args.input_image) > 10:
        print("Error: Maximum of 10 input images allowed for Lyria 3.", file=sys.stderr)
        sys.exit(1)

    model_id = MODEL_MAP[args.model]

    try:
        credentials, default_project = google.auth.default()
    except Exception:
        credentials = None
        default_project = None

    project = (
        args.project
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCP_PROJECT")
        or default_project
    )
    location = args.location or os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

    if not project:
        print("Error: Could not determine GCP Project ID from ADC or environment variables. Please run 'gcloud auth application-default login' or pass --project.", file=sys.stderr)
        sys.exit(1)

    client = genai.Client(vertexai=True, project=project, location=location, credentials=credentials)

    print(f"Model: {model_id}")
    print(f"Output: {args.filename}")
    print(f"Prompt: {args.prompt}")

    # Build input payload
    if args.input_image:
        input_payload = [{"type": "text", "text": args.prompt}]
        for img_path in args.input_image:
            with open(img_path, "rb") as img_file:
                b64_data = base64.b64encode(img_file.read()).decode("utf-8")
            mime_type = "image/png" if img_path.lower().endswith(".png") else "image/jpeg"
            input_payload.append({
                "type": "image",
                "mime_type": mime_type,
                "data": b64_data
            })
    else:
        input_payload = args.prompt

    response_format = {"type": "audio"} if args.format == "wav" else None

    audio_bytes = None
    lyrics_text = None

    try:
        # Try interactions API first as recommended in Lyria 3 documentation
        kwargs = {"model": model_id, "input": input_payload}
        if response_format:
            kwargs["response_format"] = response_format

        if hasattr(client, "interactions"):
            interaction = client.interactions.create(**kwargs)
            
            # Check convenience properties
            gen_audio = getattr(interaction, "output_audio", None)
            if gen_audio and hasattr(gen_audio, "data"):
                audio_bytes = base64.b64decode(gen_audio.data)

            lyrics_text = getattr(interaction, "output_text", None)

            # Check steps if convenience properties missed audio/text
            if not audio_bytes and hasattr(interaction, "steps"):
                lyrics_parts = []
                for step in getattr(interaction, "steps", []):
                    if getattr(step, "type", None) == "model_output":
                        for block in getattr(step, "content", []):
                            b_type = getattr(block, "type", None)
                            if b_type == "audio" and hasattr(block, "data"):
                                audio_bytes = base64.b64decode(block.data)
                            elif b_type == "text" and hasattr(block, "text"):
                                lyrics_parts.append(block.text)
                if not lyrics_text and lyrics_parts:
                    lyrics_text = "\n".join(lyrics_parts)
        else:
            # Fallback to models.generate_content if interactions endpoint is absent
            contents = [args.prompt]
            for img_path in args.input_image:
                contents.append(Image.open(img_path))
            response = client.models.generate_content(
                model=model_id,
                contents=contents
            )
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    audio_bytes = part.inline_data.data
                elif part.text:
                    lyrics_text = part.text

        if not audio_bytes:
            raise ValueError("No audio data returned from Lyria 3 model.")

        with open(args.filename, "wb") as f:
            f.write(audio_bytes)
        print(f"Success! Audio saved to {args.filename}")

        if lyrics_text:
            print("\nGenerated Lyrics / Structure:")
            print(lyrics_text)
            if args.lyrics_file:
                with open(args.lyrics_file, "w", encoding="utf-8") as lf:
                    lf.write(lyrics_text)
                print(f"Lyrics saved to {args.lyrics_file}")

    except APIError as e:
        print(f"API Error generating music with {model_id}: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error generating music with {model_id}: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
