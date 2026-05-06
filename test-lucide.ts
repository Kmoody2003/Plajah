import * as lucide from 'lucide-react';
const icons = ['Image', 'ArrowLeft', 'User', 'Music2', 'MessageSquare', 'Send', 'Play', 'UserPlus', 'UserMinus', 'Globe', 'Newspaper', 'Zap', 'TrendingUp', 'Reply', 'Trash2', 'Sparkles', 'Book', 'Disc', 'Gamepad2', 'Tv', 'Radio', 'Layers', 'ChevronLeft', 'ChevronRight', 'Maximize2', 'ExternalLink', 'Volume2', 'VolumeX', 'Pause', 'Plus', 'Check', 'X', 'Heart', 'PenTool', 'Share2', 'Mic', 'Search', 'Users', 'Cloud', 'Smile', 'MoreHorizontal', 'Info', 'BookOpen', 'Eye', 'EyeOff', 'Star', 'Clock', 'Calendar', 'Film', 'List', 'ChevronDown', 'ChevronUp', 'Settings', 'Bookmark', 'Subtitles', 'SkipBack', 'SkipForward'];
for (const icon of icons) {
  if (!lucide[icon]) {
    console.error('Undefined icon:', icon);
  }
}
