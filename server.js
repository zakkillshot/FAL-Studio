import "dotenv/config";
import express from "express";
import cors from "cors";
import { fal } from "@fal-ai/client";
import { z } from "zod";
import { MODELS } from "./models.js";
import { listProfiles, getProfile, saveProfile, deleteProfile } from "./store.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
if (process.env.FAL_KEY) fal.config({ credentials: process.env.FAL_KEY });

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static("public"));

function auth(req, res, next) {
  const expected = process.env.PLUGIN_TOKEN;
  if (!expected) return next();
  const given = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (given !== expected) return res.status(401).json({ error: "Unauthorized" });
  next();
}
function ensureKey(res) {
  if (!process.env.FAL_KEY) {
    res.status(503).json({ error: "FAL_KEY is not configured on the server. Add it as a server-side environment variable." });
    return false;
  }
  return true;
}
function modelFor(key, kinds) {
  const m = MODELS[key];
  if (!m || (kinds && !kinds.includes(m.kind))) return null;
  return m;
}
function mergeIdentity(input) {
  const p = input.profile_id ? getProfile(input.profile_id) : null;
  const images = [...(p?.image_urls || []), ...(input.image_urls || [])].slice(0, 9);
  const identity = p?.identity_prompt?.trim();
  const prompt = identity ? `${input.prompt || ""}\n\nIDENTITY LOCK: ${identity}`.trim() : (input.prompt || "");
  return { p, images, prompt };
}

app.get("/health", (req, res) => res.json({ ok: true, fal_configured: Boolean(process.env.FAL_KEY), models: Object.keys(MODELS).length }));
app.get("/models", auth, (req, res) => res.json({ models: MODELS }));
app.get("/profiles", auth, (req, res) => res.json({ profiles: listProfiles() }));
app.get("/profiles/:id", auth, (req, res) => {
  const p = getProfile(req.params.id); if (!p) return res.status(404).json({ error: "Profile not found" }); res.json(p);
});
app.post("/profiles", auth, (req, res) => {
  const schema = z.object({ name: z.string().min(1), image_urls: z.array(z.string().url()).min(1).max(9), identity_prompt: z.string().max(3000).optional() });
  const parsed = schema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.status(201).json(saveProfile(parsed.data));
});
app.delete("/profiles/:id", auth, (req, res) => res.json({ deleted: deleteProfile(req.params.id) }));

app.post("/generate/image", auth, async (req, res) => {
  if (!ensureKey(res)) return;
  const schema = z.object({ model: z.string().default("flux-2"), prompt: z.string().min(1), profile_id: z.string().optional(), image_urls: z.array(z.string().url()).max(9).optional(), input: z.record(z.any()).optional() });
  const parsed = schema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = modelFor(parsed.data.model, ["image", "image-edit", "image-lora"]); if (!m) return res.status(400).json({ error: "Unsupported image model" });
  const { images, prompt } = mergeIdentity(parsed.data);
  const input = { ...(parsed.data.input || {}), prompt };
  if (m.kind === "image-edit" && images.length) input.image_urls = images;
  try {
    const result = await fal.subscribe(m.id, { input, logs: true });
    res.json({ model: m, request_id: result.requestId, data: result.data });
  } catch (e) { res.status(502).json({ error: e?.message || String(e) }); }
});

app.post("/generate/reference-video", auth, async (req, res) => {
  if (!ensureKey(res)) return;
  const schema = z.object({ model: z.enum(["seedance-2-reference-fast","seedance-2-reference"]).default("seedance-2-reference-fast"), prompt: z.string().min(1), profile_id: z.string().optional(), image_urls: z.array(z.string().url()).max(9).optional(), video_urls: z.array(z.string().url()).max(3).optional(), audio_urls: z.array(z.string().url()).max(3).optional(), resolution: z.enum(["480p","720p","1080p"]).optional(), duration: z.union([z.string(),z.number()]).optional(), aspect_ratio: z.enum(["auto","21:9","16:9","4:3","1:1","3:4","9:16"]).optional(), generate_audio: z.boolean().optional(), seed: z.number().int().optional() });
  const parsed = schema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = modelFor(parsed.data.model, ["video-reference"]); if (!m) return res.status(400).json({ error: "Unsupported reference-video model" });
  if (parsed.data.model === "seedance-2-reference-fast" && parsed.data.resolution === "1080p") return res.status(400).json({ error: "Seedance Fast supports up to 720p. Choose 720p or 480p." });
  const { images, prompt } = mergeIdentity(parsed.data);
  const input = { prompt, image_urls: images, video_urls: parsed.data.video_urls || [], audio_urls: parsed.data.audio_urls || [], resolution: parsed.data.resolution || "720p", duration: String(parsed.data.duration || "auto"), aspect_ratio: parsed.data.aspect_ratio || "9:16", generate_audio: parsed.data.generate_audio ?? true };
  if (parsed.data.seed !== undefined) input.seed = parsed.data.seed;
  try { const result = await fal.subscribe(m.id, { input, logs: true }); res.json({ model: m, request_id: result.requestId, data: result.data }); }
  catch (e) { res.status(502).json({ error: e?.message || String(e) }); }
});

app.post("/generate/motion-video", auth, async (req, res) => {
  if (!ensureKey(res)) return;
  const schema = z.object({ model: z.enum(["kling-v3-motion-standard","kling-v3-motion-pro"]).default("kling-v3-motion-standard"), prompt: z.string().optional().default(""), image_url: z.string().url(), video_url: z.string().url(), character_orientation: z.enum(["video","image"]).optional(), input: z.record(z.any()).optional() });
  const parsed = schema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = modelFor(parsed.data.model, ["video-motion"]); if (!m) return res.status(400).json({ error: "Unsupported motion-video model" });
  const input = { ...(parsed.data.input || {}), prompt: parsed.data.prompt, image_url: parsed.data.image_url, video_url: parsed.data.video_url, character_orientation: parsed.data.character_orientation || "video" };
  try { const result = await fal.subscribe(m.id, { input, logs: true }); res.json({ model: m, request_id: result.requestId, data: result.data }); }
  catch (e) { res.status(502).json({ error: e?.message || String(e) }); }
});

app.get("/.well-known/ai-plugin.json", (req, res) => res.json({ schema_version: "v1", name_for_human: "Fal Studio", name_for_model: "fal_studio", description_for_human: "Generate and edit images and videos through fal.ai.", description_for_model: "Use fal.ai models for image generation, image editing, reference-to-video, motion control, and reusable identity profiles.", auth: process.env.PLUGIN_TOKEN ? { type: "service_http", authorization_type: "bearer", verification_tokens: {} } : { type: "none" }, api: { type: "openapi", url: `${baseUrl}/openapi.json`, is_user_authenticated: Boolean(process.env.PLUGIN_TOKEN) }, logo_url: `${baseUrl}/icon.svg`, contact_email: "owner@example.com", legal_info_url: `${baseUrl}/` }));

app.get("/openapi.json", (req, res) => res.sendFile(new URL("./openapi.json", import.meta.url).pathname));

app.listen(port, "0.0.0.0", () => console.log(`Fal Studio Plugin listening on ${port}`));
