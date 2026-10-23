import type { ThemeName, WidgetData, Forker } from "../types/widget.js";
import { FONT_FACE_CSS } from "./fonts.js";

// keeping themes in one object so adding a new theme will be in a singke entry
interface Theme {
    background: string;
    border: string;
    title: string;
    text: string;
    muted: string;
    accent: string;
}

const THEMES: Record<ThemeName, Theme> = {
    dark: {
        background: "#0d1117",
        border: "#30363d",
        title: "#58a6ff",
        text: "#e6edf3",
        muted: "#8b949e",
        accent: "#3fb950",
    },
    light: {
        background: "#ffffff",
        border: "#d0d7de",
        title: "#0969da",
        text: "#1f2328",
        muted: "#656d76",
        accent: "#1a7f37",
    },
};

// layouts
const WIDTH = 495;
const HEADER_BOTTOM = 108; 
const FIRST_ROW_Y = 138; 
const ROW_HEIGHT = 30;
const FOOTER_SPACE = 28;
const FONT = "'Sniglet', 'Segoe UI', Ubuntu, 'Helvetica Neue', Arial, sans-serif";

// security on dynamic strings
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
    return String(n);
}

// truncate long names
function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

// forker row draw
function renderForkerRow(forker: Forker, index: number, t: Theme): string {
    const y = FIRST_ROW_Y + index * ROW_HEIGHT;
    const initial = escapeXml(forker.login.charAt(0).toUpperCase());
    const login = escapeXml(truncate(forker.login, 26));
    const prLabel = `${forker.mergedPrCount} merged PR${forker.mergedPrCount === 1 ? "" : "s"}`;

    return `
    <circle cx="35" cy="${y - 5}" r="11" fill="${t.accent}" fill-opacity="0.2"/>
    <text x="35" y="${y - 1}" text-anchor="middle" font-size="12" font-weight="700" fill="${t.accent}">${initial}</text>
    <text x="56" y="${y}" font-size="14" fill="${t.text}">@${login}</text>
    <text x="470" y="${y}" text-anchor="end" font-size="13" fill="${t.muted}">${prLabel}</text>`;
}

export function renderWidget(data: WidgetData, themeName: ThemeName = "dark"): string {
    const t = THEMES[themeName];
    const rowCount = data.topForkers.length;

    // the card grows with the number of rows. Math.max keeps space for the
    // "no forks yet" message when the list is empty.
    const height = HEADER_BOTTOM + 10 + Math.max(rowCount, 1) * ROW_HEIGHT + FOOTER_SPACE;

    const title = escapeXml(truncate(`${data.owner}/${data.repo}`, 34));

    const rows =
    rowCount > 0
        ? data.topForkers.map((f, i) => renderForkerRow(f, i, t)).join("")
        : `<text x="25" y="${FIRST_ROW_Y}" font-size="14" fill="${t.muted}">No forks yet. Be the first!</text>`;

    // role="img" plus <title> gives screen readers a description of the card.
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="Fork stats for ${title}" font-family="${FONT}">
  <title>Fork stats for ${title}</title>
  <style>${FONT_FACE_CSS}</style>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="10" fill="${t.background}" stroke="${t.border}"/>

  <text x="25" y="35" font-size="18" font-weight="800" fill="${t.title}">${title}</text>

  <text x="25" y="78" font-size="28" font-weight="800" fill="${t.text}">${formatCount(data.forkCount)}</text>
  <text x="25" y="95" font-size="12" fill="${t.muted}">forks</text>

  <text x="250" y="78" font-size="28" font-weight="800" fill="${t.accent}">${formatCount(data.mergedPrTotal)}</text>
  <text x="250" y="95" font-size="12" fill="${t.muted}">merged PRs from forks</text>

  <line x1="25" y1="${HEADER_BOTTOM}" x2="470" y2="${HEADER_BOTTOM}" stroke="${t.border}"/>
${rows}

  <text x="470" y="${height - 10}" text-anchor="end" font-size="10" fill="${t.muted}">Powered by Spoon</text>
</svg>`;
}