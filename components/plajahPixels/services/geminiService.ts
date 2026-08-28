/**
 * Pixels AI features, proxied through the server.
 *
 * These used to call Gemini directly from the browser with an API key baked
 * into the bundle via vite `define`. That key leaked and was revoked, so every
 * call now goes through /api/ai/veo/** (routes/veo.ts) with a Firebase ID
 * token; the Google AI key lives only on the server. The one exception is the
 * realtime Live session, which connects from the browser using a short-lived
 * ephemeral token minted by POST /api/ai/veo/live-token — still no real key
 * in the client.
 */
import { GoogleGenAI, Type, LiveServerMessage, Modality } from "@google/genai";
import { VisualizationConfig, VisualizerMode } from "../types";
import { auth } from "../../../services/backendService";

const API_BASE = '/api/ai/veo';

async function getIdToken(): Promise<string | null> {
    const user = auth.currentUser;
    if (!user) return null;
    try { return await user.getIdToken(); } catch { return null; }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const token = await getIdToken();
    if (!token) throw new Error('Sign in to use AI features.');
    return fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
            ...(init?.headers || {}),
            'Authorization': `Bearer ${token}`,
        },
    });
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await apiFetch(path, init);
    if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        throw new Error(body.error || `AI request failed (${res.status}).`);
    }
    return res.json() as Promise<T>;
}

export const generateThemeFromMood = async (moodDescription: string): Promise<Partial<VisualizationConfig>> => {
    const { text } = await apiJson<{ text: string }>('/content', {
        method: 'POST',
        body: JSON.stringify({
            model: "gemini-2.5-flash",
            contents: `Generate a music visualization configuration based on this mood: "${moodDescription}". Output JSON.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        mode: { type: Type.STRING, enum: Object.values(VisualizerMode) },
                        colorPalette: { type: Type.ARRAY, items: { type: Type.STRING } },
                        smoothingTimeConstant: { type: Type.NUMBER },
                        sensitivity: { type: Type.NUMBER },
                        glowIntensity: { type: Type.NUMBER },
                        speed: { type: Type.NUMBER },
                        enableBlur: { type: Type.BOOLEAN },
                        blurStrength: { type: Type.NUMBER },
                        blendMode: { type: Type.STRING },
                        backgroundOpacity: { type: Type.NUMBER },
                        backgroundPulseIntensity: { type: Type.NUMBER },
                        particleCount: { type: Type.NUMBER },
                        enableText: { type: Type.BOOLEAN },
                        textContent: { type: Type.STRING },
                        enableCaptions: { type: Type.BOOLEAN },
                        captionsText: { type: Type.STRING }
                    },
                    required: ["name", "mode", "colorPalette"]
                }
            }
        })
    });
    return JSON.parse(text || "{}");
};

export const generateVideoLoop = async (imageBase64: string, mimeType: string, prompt: string): Promise<string> => {
    const { operationName } = await apiJson<{ operationName: string }>('/generate', {
        method: 'POST',
        body: JSON.stringify({
            model: 'veo-3.1-fast-generate-preview',
            prompt,
            image: { imageBytes: imageBase64, mimeType },
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
        })
    });

    let videoUri: string | undefined;
    for (;;) {
        await new Promise(r => setTimeout(r, 5000));
        const op = await apiJson<{ done: boolean; videoUri?: string; error?: string }>(
            `/operation?name=${encodeURIComponent(operationName)}`
        );
        if (op.done) {
            if (op.error || !op.videoUri) throw new Error(op.error || 'Video generation produced no video.');
            videoUri = op.videoUri;
            break;
        }
    }

    // videoUri is our own /api/ai/veo/video proxy path — the server appends its
    // key upstream and streams the bytes back; fetch it authed like everything else.
    const response = await apiFetch(videoUri.replace(API_BASE, ''));
    if (!response.ok) throw new Error('Video download failed.');
    const blob = await response.blob();
    return URL.createObjectURL(blob);
};

export const generateLrcFromAudio = async (audioBase64: string, mimeType: string): Promise<string> => {
    const { text } = await apiJson<{ text: string }>('/content', {
        method: 'POST',
        body: JSON.stringify({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { text: "Transcribe this audio into LRC format [mm:ss.xx] Text." },
                    { inlineData: { mimeType, data: audioBase64 } }
                ]
            }
        })
    });
    return text || "";
};

export class LiveLyricsSession {
    private session: any = null;
    private active = false;

    /** The apiKey argument is legacy and ignored — auth now comes from the server-minted ephemeral token. */
    constructor(_apiKey?: string) {}

    async connect(audioCtx: AudioContext, source: MediaElementAudioSourceNode, onTranscript: (t: string, f: boolean) => void) {
        if (this.active) return;
        this.active = true;

        // Mint a single-use ephemeral Live-API token (server holds the real key).
        let token: string;
        let model: string;
        try {
            const minted = await apiJson<{ token: string; model: string }>('/live-token', { method: 'POST' });
            token = minted.token;
            model = minted.model;
        } catch (e) {
            this.active = false;
            throw e;
        }

        // Ephemeral tokens ride the v1alpha surface and are passed as the apiKey.
        const client = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } });
        try {
            this.session = await client.live.connect({
                model,
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    systemInstruction: "Transcribe lyrics in real-time."
                },
                callbacks: {
                    onmessage: (msg: LiveServerMessage) => {
                        if (msg.serverContent?.inputTranscription?.text) {
                            onTranscript(msg.serverContent.inputTranscription.text, false);
                        }
                        if (msg.serverContent?.turnComplete) onTranscript("", true);
                    },
                    onclose: () => this.active = false,
                    onerror: () => this.active = false
                }
            });
        } catch (e) {
            this.active = false;
            throw e;
        }
    }

    disconnect() {
        this.active = false;
        this.session = null;
    }
}
