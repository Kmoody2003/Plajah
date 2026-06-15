import React from 'react';
import { Plus, Trash2, X } from 'lucide-react';

interface ColorPaletteEditorProps {
    colors: string[];
    onChange: (colors: string[]) => void;
}

const ColorPaletteEditor: React.FC<ColorPaletteEditorProps> = ({ colors, onChange }) => {
    
    const updateColor = (index: number, newColor: string) => {
        const newColors = [...colors];
        newColors[index] = newColor;
        onChange(newColors);
    };

    const addColor = () => {
        // Limit to 8 colors to prevent UI clutter
        if (colors.length >= 8) return;
        // Default to white or the last color in the list
        const newColor = colors[colors.length - 1] || "#ffffff";
        onChange([...colors, newColor]);
    };

    const removeColor = (index: number) => {
        // Minimum 2 colors required for gradients
        if (colors.length <= 2) return;
        const newColors = colors.filter((_, i) => i !== index);
        onChange(newColors);
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {colors.map((color, index) => (
                    <div key={index} className="group relative">
                        {/* Color Swatch / Input Wrapper */}
                        <div 
                            className="w-8 h-8 rounded-full border border-white/20 shadow-sm overflow-hidden transition-transform hover:scale-110 cursor-pointer relative"
                            style={{ backgroundColor: color }}
                        >
                            <input 
                                type="color" 
                                value={color}
                                onChange={(e) => updateColor(index, e.target.value)}
                                className="absolute inset-0 w-[200%] h-[200%] -top-1/2 -left-1/2 opacity-0 cursor-pointer p-0 border-0"
                                title="Change color"
                            />
                        </div>
                        
                        {/* Remove Button (Only visible on hover if > 2 colors) */}
                        {colors.length > 2 && (
                            <button
                                onClick={() => removeColor(index)}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500/90 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md z-10"
                                title="Remove color"
                            >
                                <X className="w-2.5 h-2.5 text-white" />
                            </button>
                        )}
                    </div>
                ))}

                {/* Add Button */}
                {colors.length < 8 && (
                    <button 
                        onClick={addColor}
                        className="w-8 h-8 rounded-full border border-white/20 border-dashed flex items-center justify-center text-white/40 hover:text-white hover:border-white/60 hover:bg-white/5 transition-all"
                        title="Add color"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                )}
            </div>
            <div className="text-[10px] text-white/30 italic">
                Click to edit. {colors.length > 2 ? 'Hover to remove.' : ''}
            </div>
        </div>
    );
};

export default ColorPaletteEditor;