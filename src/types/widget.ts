export interface Forker {
    login: string; // GH username
    mergedPrCount: number;
}

export interface WidgetData {
    owner: string;
    repo: string;
    forkCount: number;
    mergedPrTotal: number;  // total merged PRs from forks
    topForkers: Forker[];    // already sorted and trimmed
}


// visual theme renderer
export type ThemeName = "dark" | "light";