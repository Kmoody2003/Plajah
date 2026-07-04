import { GoogleGenAI, Type } from "@google/genai";

// In the browser we do NOT use a client-side API key (it isn't in the production
// bundle, and shouldn't be). Instead every generateContent() call is routed
// through the server proxy /api/ai/gemini, which runs Gemini with the server-side
// key. On the server (Node), the SDK is used directly with process.env. Callers
// are unchanged — the shim returns { text } just like the SDK response.
function browserGeminiProxy(): any {
  return {
    models: {
      generateContent: async (params: any) => {
        try {
          const { auth } = await import('./firebase');
          const token = auth.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
          const res = await fetch('/api/ai/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(params),
          });
          if (!res.ok) return { text: '' };
          const data = await res.json().catch(() => ({}));
          return { text: (data as any).text || '' };
        } catch {
          return { text: '' };
        }
      },
    },
  };
}

const getAI = (): any => {
  if (typeof window !== 'undefined') return browserGeminiProxy();
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. Using fallback metadata.");
    return null;
  }

  if (typeof GoogleGenAI !== 'function') {
    console.error("GoogleGenAI is not a function/constructor.");
    return null;
  }

  return new GoogleGenAI({ apiKey });
};

export const callGemini = async (prompt: string, config: any = {}, model: string = "gemini-flash-latest") => {
  const ai = getAI();
  if (!ai) return null;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: config
    });
    return response.text;
  } catch (error) {
    console.error("Error calling Gemini:", error);
    return null;
  }
};

export const generateAlbumMetadata = async (albumTitle: string, trackNames: string[]) => {
  const ai = getAI();
  if (!ai) return { description: "A sonic journey through sound.", themeColor: "#ffffff" };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: `Generate a compelling, artistic album description, detailed atmospheric liner notes (credits, recording vibes), and a recommended primary theme color (hex code) for a music album titled "${albumTitle}" with the following tracks: ${trackNames.join(', ')}. The description should sound like it was written by a professional music critic.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: {
              type: Type.STRING,
              description: "An evocative 2-3 paragraph description for the main bio.",
            },
            linerNotes: {
              type: Type.STRING,
              description: "Detailed technical credits, recording studio vibes, and track-by-track highlights.",
            },
            themeColor: {
              type: Type.STRING,
              description: "A sleek hex color code.",
            },
          },
          required: ["description", "linerNotes", "themeColor"],
        },
      },
    });
    return JSON.parse(response.text);
  } catch (error) {
    return { description: "A sonic journey through sound.", themeColor: "#ffffff" };
  }
};

export const generateTrackLyrics = async (title: string, artist: string) => {
  const ai = getAI();
  if (!ai) return ["Music is the only language...", "Lost in the frequency.", "Deep within the soundscape."];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: `Generate 12 lines of poetic, abstract lyrics for a song titled "${title}" by "${artist}". The lyrics should be moody and atmospheric. Return as a JSON array of strings.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    return JSON.parse(response.text) as string[];
  } catch (error) {
    return ["Music is the only language...", "Lost in the frequency.", "Deep within the soundscape."];
  }
};

/** Speech-to-text: transcribe spoken audio (e.g. a sermon) to clean text. */
export const transcribeSpeech = async (audioBase64: string, mimeType: string): Promise<string> => {
  const ai = getAI();
  if (!ai) return '';
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        { inlineData: { data: audioBase64, mimeType } },
        { text: 'Transcribe this audio to clean, readable text. Output ONLY the transcript — full sentences and paragraphs, no timestamps, no speaker labels, no commentary. Preserve any scripture references you clearly hear.' },
      ],
    });
    return response.text || '';
  } catch (error) {
    console.error('transcribeSpeech error:', error);
    return '';
  }
};

export const generateTimeCodedCaptions = async (audioBase64: string, mimeType: string, title: string, artist: string) => {
  const ai = getAI();
  if (!ai) return [];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [
        {
          inlineData: {
            data: audioBase64,
            mimeType: mimeType
          }
        },
        {
          text: `You are a precise audio transcription engine. Listen to every second of this audio titled "${title}" by "${artist}" and generate time-coded captions covering the ENTIRE duration from first word to last.

Rules:
- Timestamps must be precise to 0.1 seconds (e.g. 14.3, not 14). Each timestamp marks the exact moment that line BEGINS being sung or spoken.
- Cover every section: intro, verses, pre-chorus, chorus, bridge, outro, and any spoken parts.
- For purely instrumental gaps longer than 3 seconds with no vocals, add an "(instrumental)" entry with the correct start time.
- Do NOT invent or guess lyrics — only transcribe words you can clearly hear in the audio.
- Each "text" entry should be one sung phrase of roughly 3-8 words. Do not merge multiple lines into one entry.
- Sort all entries by ascending time.
- The last entry must be close to the actual end of the audio — do not stop early.`
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.NUMBER },
              text: { type: Type.STRING }
            },
            required: ["time", "text"]
          }
        }
      }
    });
    return JSON.parse(response.text) as { time: number; text: string }[];
  } catch (error) {
    console.error("Error generating time-coded captions:", error);
    return [];
  }
};

export const analyzeThemeBackground = async (imageBase64: string, theme: string) => {
  const ai = getAI();
  if (!ai) return [];

  const prompts: { [key: string]: string } = {
    'SCRAPBOOK': 'Identify areas for photos (PHOTO) and handwritten notes (TEXT).',
    'PHOTO_ALBUM': 'Identify areas for photos (PHOTO).',
    'MUSIC_PLAYER': 'Identify the exact area where a vinyl record or CD should be placed (VINYL).',
    'NEWSPAPER': 'Identify areas for article photos (PHOTO) and article text blocks (TEXT).',
    'ARCADE': 'Identify the area for the game screen (GAME_SCREEN).'
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: "image/jpeg"
          }
        },
        {
          text: `Analyze this background image for a social media post theme: ${theme}.
          ${prompts[theme] || 'Identify areas for media (PHOTO) and text (TEXT).'}

          Return a JSON array of objects representing "Interactive Zones".
          Each object must have:
          - id: unique string
          - type: one of "PHOTO", "TEXT", "VINYL", "GAME_SCREEN"
          - x: horizontal position of top-left corner (0-100 percentage)
          - y: vertical position of top-left corner (0-100 percentage)
          - width: width (0-100 percentage)
          - height: height (0-100 percentage)
          - rotation: rotation in degrees (optional, default 0)

          Be extremely precise with the coordinates so the content fits perfectly into the design elements of the background.`
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["PHOTO", "TEXT", "VINYL", "GAME_SCREEN"] },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              width: { type: Type.NUMBER },
              height: { type: Type.NUMBER },
              rotation: { type: Type.NUMBER }
            },
            required: ["id", "type", "x", "y", "width", "height"]
          }
        }
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error analyzing theme background:", error);
    return [];
  }
};

export const generateLinerNotes = async (title: string, artist: string, trackNames: string[]) => {
  const ai = getAI();
  if (!ai) return "Technical credits and recording details were not generated.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: `Generate detailed, atmospheric collector's edition liner notes for a project titled "${title}" by "${artist}". Mention these tracks: ${trackNames.join(', ')}. Include technical credits (fictional if needed), recording studio vibes, and instrumental highlights. Write in a deep, music-journalism style.`,
    });
    return response.text;
  } catch (error) {
    return "The recording process remains a mystery...";
  }
};

export const generatePlanetInsight = async (planetName: string) => {
  const ai = getAI();
  if (!ai) return { summary: "A mysterious world in our solar system.", fact: "Selected for further study." };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: `Provide a scientifically accurate, brief (2-3 sentences) insight into the planet ${planetName}. Focus on a recent discovery or a fascinating geological/atmospheric fact. Also provide one "Micro-Fact". Return as JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            fact: { type: Type.STRING },
          },
          required: ["summary", "fact"],
        },
      },
    });
    return JSON.parse(response.text);
  } catch (error) {
    return { summary: "A mysterious world in our solar system.", fact: "Selected for further study." };
  }
};

export const generatePlantInsight = async (topic: string) => {
  const ai = getAI();
  if (!ai) return { summary: "Plants are the lungs of our planet.", fact: "Photosynthesis is the key to life on Earth." };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: `Persona: You are Nano Banana 2, a highly advanced botanical AI.
      Topic: "${topic}".
      Task: Provide a scientifically rigorous, advanced insight (2-3 sentences) into this botanical subject. Use precise biological terminology (e.g., mention specific enzymes like RuBisCO, or structural components like thylakoid membranes).
      Also provide one "Micro-Genetic Fact" regarding the topic.
      Return as JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            fact: { type: Type.STRING },
          },
          required: ["summary", "fact"],
        },
      },
    });
    return JSON.parse(response.text);
  } catch (error) {
    return { summary: "Botanical synthesis offline.", fact: "Check neural connection." };
  }
};

export const generateDemoWorlds = async () => {
  const ai = getAI();
  if (!ai) return [];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: `Generate 3 distinct and diverse fictional world concepts.
      One should be Sci-Fi (Cyberpunk or Space Opera), one High Fantasy, and one Surreal/Abstract.
      For each world, provide:
      - name: A unique title
      - description: A compelling 2-sentence summary
      - primaryColor: Hex code
      - secondaryColor: Hex code
      - worldType: 'FICTION'
      - character: { name, role, bio }
      - lore: { title, content, type: 'LOCATION' | 'ENVIRONMENT' | 'ITEM' | 'PLOT_POINT' | 'BACKSTORY' }
      - timelineEvent: { title, description, year }
      - module: { name, description }

      Return as a JSON array of objects.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
              primaryColor: { type: Type.STRING },
              secondaryColor: { type: Type.STRING },
              worldType: { type: Type.STRING },
              character: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  role: { type: Type.STRING },
                  bio: { type: Type.STRING },
                },
                required: ["name", "role", "bio"]
              },
              lore: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING },
                  type: { type: Type.STRING },
                },
                required: ["title", "content", "type"]
              },
              timelineEvent: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  year: { type: Type.NUMBER },
                },
                required: ["title", "description", "year"]
              },
              module: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ["name", "description"]
              }
            },
            required: ["name", "description", "primaryColor", "secondaryColor", "worldType", "character", "lore", "timelineEvent", "module"]
          }
        }
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Error generating demo worlds:", error);
    return [];
  }
};
