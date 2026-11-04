export interface GitHubUser {
    id: number;
    login: string;
    avatarUrl: string | null;
}

export interface GitHubRepo {
    id: number;
    owner: string;
    name: string;
    forksCount: number;
}

export interface GitHubFork {
    id: number;
    createdAt: string;
    owner: GitHubUser;
}

export interface GitHubPullRequest {
    id: number;
    number: number;
    title: string;
    state: "open" | "closed" | "merged";
    mergedAt: string | null;
    createdAt: string;
    author: GitHubUser;
}

// cap how many pages we fetch to protect rate limit
export interface Fetched<T> {
    items: T[];
    complete: boolean;
}

// the contract the sync service depends on 
export interface GitHubClient {
    getRepo(owner: string, repo: string): Promise<GitHubRepo>;
    listForks(owner: string, repo: string): Promise<Fetched<GitHubFork>>;
    // only prs that came from forks (including deleted forks)
    listForkPullRequests(owner: string, repo: string, baseRepoId: number): Promise<Fetched<GitHubPullRequest>>;
}

