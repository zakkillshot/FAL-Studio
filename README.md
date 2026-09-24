# Fal Studio Plugin

A private server-side connector for fal.ai, designed for ChatGPT-style tool use and your Zak Studio workflow.

## What it does

- Nano Banana image editing
- FLUX.2, FLUX.2 Flash, and FLUX.2 LoRA inference
- Seedance 2.0 Reference-to-Video (Fast + Standard; Fast is capped at 720p)
- Kling V3 Motion Control (Standard + Pro)
- Reusable identity profiles with up to 9 reference-image URLs
- Keeps `FAL_KEY` on the server
- Exposes an OpenAPI document at `/openapi.json`
- Includes a legacy-style plugin manifest at `/.well-known/ai-plugin.json` for compatible clients

## Run locally

1. Install Node.js 22+.
2. Copy `.env.example` to `.env`.
3. Put your fal.ai key in `FAL_KEY`.
4. Set a strong `PLUGIN_TOKEN`.
5. Run:

```bash
npm install
npm start
```

Open `http://localhost:3000`. If you set `PLUGIN_TOKEN`, enter that same token in the web UI once; it is stored locally on that browser/device and sent only as the Bearer token to your server.

## Deploy

Deploy the folder with Docker on Railway, Render, Fly.io, or another Node/Docker host. Set these server-side variables:

- `FAL_KEY`
- `PLUGIN_TOKEN`
- `PUBLIC_BASE_URL=https://your-domain`

After deployment, update the `servers[0].url` value inside `openapi.json` to your public domain, or have your integration use the deployed OpenAPI URL directly.

## Identity profile example

```json
POST /profiles
{
  "name": "Zak Master Identity",
  "image_urls": [
    "https://public.example/front.jpg",
    "https://public.example/three-quarter.jpg"
  ],
  "identity_prompt": "Preserve the same face shape, eye shape, nose, lips, jawline, skin tone, curly/coily hair and short mustache/goatee. Do not beautify or reshape the face."
}
```

Use the returned `id` as `profile_id` in image or Seedance reference-video requests.

## Seedance reference-video example

```json
POST /generate/reference-video
{
  "model": "seedance-2-reference-fast",
  "profile_id": "YOUR_PROFILE_ID",
  "video_urls": ["https://public.example/reference.mp4"],
  "prompt": "@Video1 controls the motion and camera. Replace the original subject with the identity in the reference images. Keep timing and framing. Change only the clothing to a black fitted shirt.",
  "resolution": "720p",
  "duration": "10",
  "aspect_ratio": "9:16",
  "generate_audio": true
}
```

## Security

Never put your fal key into browser JavaScript. This app intentionally keeps it server-side. If `PLUGIN_TOKEN` is set, all generation/profile endpoints require `Authorization: Bearer <PLUGIN_TOKEN>`.

## Notes

fal model schemas change over time. This connector exposes an `input` passthrough on image and Kling motion requests so new optional fields can be used without rebuilding the whole server. The named endpoints themselves are allow-listed so a client cannot arbitrarily run any fal model on your account.
