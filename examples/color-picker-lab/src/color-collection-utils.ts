export function colorsToGradient(colors: readonly string[], discrete = false): string {
  if (colors.length === 0) return '#2483ff';
  if (colors.length === 1) return colors[0] ?? '#2483ff';
  if (discrete) {
    const segments = colors.flatMap((color, index) => {
      const start = (index / colors.length) * 100;
      const end = ((index + 1) / colors.length) * 100;
      return [`${color} ${start}%`, `${color} ${end}%`];
    });
    return `linear-gradient(90deg, ${segments.join(', ')})`;
  }
  const stops = colors.map((color, index) => `${color} ${(index / (colors.length - 1)) * 100}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
