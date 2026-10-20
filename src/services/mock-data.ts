import type { WidgetData } from "../types/widget.js";

// for testing fake numbers but real owner
export function getMockWidgetData(owner: string, repo: string): WidgetData {
    return {
        owner,
        repo,
        forkCount: 1284,
        mergedPrTotal: 96,
        topForkers: [
            { login: "Oluwasanmisola-Towoju", mergedPrCount: 14 },
            { login: "tunde-dev", mergedPrCount: 9 },
            { login: "chioma", mergedPrCount: 7 },
            { login: "kofi-builds", mergedPrCount: 4 },
            { login: "zainab", mergedPrCount: 1 },
        ]
    };
};