import React, { useState } from 'react';
import { Wand2, Loader2, X } from 'lucide-react';
import { generateThemeFromMood } from '../services/geminiService';
import { VisualizationConfig } from '../types';

interface ThemeGeneratorProps {
    onThemeGenerated: (config: Partial<VisualizationConfig>) => void;
    currentConfigName: string;
}

const ThemeGenerator: React.FC<ThemeGeneratorProps> = ({ onThemeGenerated, currentConfigName }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setLoading(true);
        setError(null);
        try {
            const config = await generateThemeFromMood(prompt);
            onThemeGenerated(config);
            setIsOpen(false);
            setPrompt('');
        } catch (err: any) {
            setError(err.message || 'Failed to generate theme');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                className="group flex items-center space-x-2 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 transition-all"
            >
                <Wand2 className="w-4 h-4 text-purple-400 group-hover:text-purple-300" />
                <span className="text-sm font-medium text-white">AI Theme</span>
            </button>
        );
    }

    return (
        <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 w-80 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-semibold flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-purple-400" />
                    Generate Theme
                </h3>
                <button onClick={() => setIsOpen(false)} className="text-white/50 hover:text-white">
                    <X className="w-5 h-5" />
                </button>
            </div>
            
            <form onSubmit={handleGenerate} className="space-y-3">
                <div>
                    <label className="text-xs text-white/60 mb-1 block">Describe the music or desired vibe</label>
                    <textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., Cyberpunk rain, 80s synthwave sunset, Deep underwater..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[80px]"
                    />
                </div>
                
                {error && (
                    <p className="text-red-400 text-xs">{error}</p>
                )}

                <button 
                    type="submit"
                    disabled={loading || !prompt.trim()}
                    className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/50 text-white rounded-lg py-2 text-sm font-medium transition-colors flex justify-center items-center"
                >
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Dreaming...
                        </>
                    ) : (
                        'Generate Visuals'
                    )}
                </button>
            </form>
        </div>
    );
};

export default ThemeGenerator;
