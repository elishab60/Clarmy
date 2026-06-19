#!/usr/bin/env python3
"""
Grok (xAI) image-gen connector via the headless `grok` CLI.

Goes through the grok.com subscription (OAuth cached in ~/.grok), NOT the paid
xAI API. Mirrors the street_gooners gemini/grok connector so it slots into the
office sprite pipeline (scripts/sprite/*).

Mechanism:
  - Without --input -> `image_gen`  tool (new image from prompt).
  - With --input    -> `image_edit` tool (edit from 1+ refs). PREFERRED: keeps a
    stable identity across frames (reference-first). This is the fix vs the old
    manual no-reference step that made the character drift.
  - grok writes the image to ~/.grok/sessions/<cwd-enc>/<sessionId>/images/N.jpg
    We read sessionId from the JSON output, locate the file, convert to PNG -> --output.

Usage:
  python3 scripts/sprite/grok_imagegen.py --output out.png --prompt "..."
  python3 scripts/sprite/grok_imagegen.py --input ref.png --output out.png --prompt-file p.txt
  echo "prompt" | python3 scripts/sprite/grok_imagegen.py --input a.png --input b.png --output out.png

Exit codes: 0 ok | 1 bad arg/missing file | 3 grok error | 4 no image produced
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.parse
from pathlib import Path

GROK_HOME = Path(os.environ.get("GROK_HOME", str(Path.home() / ".grok")))


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--input", action="append", default=[],
                   help="Ref image (repeatable). If given -> image_edit.")
    p.add_argument("--output", required=True, help="Output PNG path")
    p.add_argument("--prompt-file", help="File containing the prompt")
    p.add_argument("--prompt", help="Inline prompt (takes precedence over --prompt-file)")
    p.add_argument("--aspect-ratio", default="auto",
                   help="1:1 | 16:9 | 9:16 | 4:3 | 3:4 | auto (default auto)")
    p.add_argument("--model", default=None, help="grok agent model (optional)")
    p.add_argument("--max-turns", type=int, default=5)
    p.add_argument("--timeout", type=int, default=360, help="Timeout seconds")
    p.add_argument("--cwd", default=os.getcwd())
    return p.parse_args()


def load_prompt(args):
    if args.prompt:
        return args.prompt
    if args.prompt_file:
        return Path(args.prompt_file).read_text(encoding="utf-8")
    if not sys.stdin.isatty():
        return sys.stdin.read()
    print("ERROR: provide --prompt, --prompt-file or stdin", file=sys.stderr)
    sys.exit(1)


def build_directive(user_prompt, inputs, aspect):
    """Directive for the grok agent: call ONLY the image tool, nothing else."""
    ar = f' Use aspect_ratio "{aspect}".' if aspect and aspect != "auto" else ""
    if inputs:
        refs = ", ".join(os.path.abspath(p) for p in inputs)
        tool = (
            f'Call the image_edit tool exactly once with image set to these '
            f'reference path(s): {refs}.{ar} Transformation/prompt:\n'
        )
    else:
        tool = f'Call the image_gen tool exactly once.{ar} Prompt:\n'
    return (
        "You are an image generation worker. Do not write code, do not run "
        "shell commands, do not ask questions. " + tool + user_prompt +
        "\n\nAfter the tool returns, reply with nothing but the word DONE."
    )


def session_images_dir(cwd, session_id):
    enc = urllib.parse.quote(os.path.abspath(cwd), safe="")
    return GROK_HOME / "sessions" / enc / session_id / "images"


def newest_image(d):
    if not d.is_dir():
        return None
    imgs = [p for p in d.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]
    if not imgs:
        return None
    return max(imgs, key=lambda p: p.stat().st_mtime)


def main():
    args = parse_args()
    for inp in args.input:
        if not Path(inp).is_file():
            print(f"ERROR: input not found: {inp}", file=sys.stderr)
            sys.exit(1)
    user_prompt = load_prompt(args)
    directive = build_directive(user_prompt, args.input, args.aspect_ratio)

    cmd = [
        "grok", "-p", directive,
        "--cwd", args.cwd,
        "--sandbox", "workspace",      # writes confined to CWD/tmp/~/.grok
        "--output-format", "json",
        "--no-auto-update",
        "--no-subagents",
        "--disable-web-search",
        "--max-turns", str(args.max_turns),
    ]
    if args.model:
        cmd += ["-m", args.model]

    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=args.timeout,
            cwd=args.cwd, env={**os.environ},
        )
    except subprocess.TimeoutExpired:
        print(f"ERROR: grok timeout ({args.timeout}s)", file=sys.stderr)
        sys.exit(3)

    if proc.returncode != 0:
        print(f"ERROR: grok rc={proc.returncode}\n{proc.stderr[-800:]}", file=sys.stderr)
        sys.exit(3)

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        print(f"ERROR: unreadable grok JSON:\n{proc.stdout[-800:]}", file=sys.stderr)
        sys.exit(3)
    if data.get("type") == "error":
        print(f"ERROR: grok: {data.get('message')}", file=sys.stderr)
        sys.exit(3)

    sid = data.get("sessionId")
    img = newest_image(session_images_dir(args.cwd, sid)) if sid else None
    if img is None:
        text = data.get("text", "")
        for tok in text.replace("`", " ").split():
            cand = urllib.parse.unquote(tok)
            if cand.lower().endswith((".jpg", ".jpeg", ".png", ".webp")) and Path(cand).is_file():
                img = Path(cand)
                break
    if img is None:
        print(f"ERROR: no image produced. text={data.get('text','')[:300]}", file=sys.stderr)
        sys.exit(4)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image
        Image.open(img).convert("RGBA").save(out)
    except Exception:
        import shutil
        shutil.copy(img, out)
    print(f"[grok] {('image_edit' if args.input else 'image_gen')} -> {out} (src {img.name}, session {sid})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
