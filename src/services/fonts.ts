import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

// we workauround the font serving by embedding it inside the SVG itself as a base64 data URI
// because GH serves README images through a proxy that refuses to load anything external
const require = createRequire(import.meta.url);

// find the installed font package on disk
const fontDir = join(dirname(require.resolve("@fontsource/sniglet/package.json")), "files");

// read the .woff2 file and trun its bytes into a data URI string
function toDataUri(fileName: string): string {
    const bytes = readFileSync(join(fontDir, fileName));
    return `data:font/woff2;base64,${bytes.toString("base64")}`;
}

// we build the font-face CSS once and then embed it into every SVG we generate
export const FONT_FACE_CSS = `
@font-face {
    font-family: 'Sniglet';
    font-weight: 400;
    src: url('${toDataUri("sniglet-latin-400-normal.woff2")}') format('woff2');
}
@font-face {
    font-family: 'Sniglet';
    font-weight: 800;
    src: url(${toDataUri("sniglet-latin-800-normal.woff2")}) format('woff2');
}
`;