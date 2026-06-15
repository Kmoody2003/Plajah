
import { GoogleGenAI, Type, LiveServerMessage, Modality } from "@google/genai";
import { VisualizationConfig, VisualizerMode } from "../types";

export const generateThemeFromMood = async (moodDescription: string): Promise<Partial<VisualizationConfig>> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
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
    });
    return JSON.parse(response.text || "{}");
};

export const generateVideoLoop = async (imageBase64: string, mimeType: string, prompt: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt,
        image: { imageBytes: imageBase64, mimeType },
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
    });
    while (!operation.done) {
        await new Promise(r => setTimeout(r, 5000));
        operation = await ai.operations.getVideosOperation({ operation });
    }
    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
};

export const generateLrcFromAudio = async (audioBase64: string, mimeType: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { text: "Transcribe this audio into LRC format [mm:ss.xx] Text." },
                { inlineData: { mimeType, data: audioBase64 } }
            ]
        }
    });
    return response.text || "";
};

export class LiveLyricsSession {
    private client: GoogleGenAI;
    private session: any = null;
    private active = false;

    constructor(apiKey: string) {
        this.client = new GoogleGenAI({ apiKey });
    }

    async connect(audioCtx: AudioContext, source: MediaElementAudioSourceNode, onTranscript: (t: string, f: boolean) => void) {
        if (this.active) return;
        this.active = true;
        this.session = await this.client.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
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
    }

    disconnect() {
        this.active = false;
        this.session = null;
    }
}
