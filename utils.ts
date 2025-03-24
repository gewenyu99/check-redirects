import { spawnSync } from "bun";

export function urlId(baseURL: string): string {
    return baseURL.replace(/https:\/\//g, '').replace(/\//g, '_');
}

export function getGitShortHash(): Promise<string> {
    const proc = spawnSync({
      cmd: ["git", "rev-parse", "--short", "HEAD"],
      cwd: process.cwd(), // Root of this node repo
    });
    const output = new Response(proc.stdout).text();
    return output;
}


