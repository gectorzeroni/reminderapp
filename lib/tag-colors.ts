import type { CSSProperties } from "react";

function hashTag(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getTagChipStyle(tag: string): CSSProperties {
  const hash = hashTag(tag.toLowerCase());
  const hue = hash % 360;
  const saturation = 84 + (hash % 10); // 84-93
  const lightness = 44 + (hash % 8); // 44-51

  return {
    backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
    borderColor: "transparent",
    color: "#ffffff"
  };
}
