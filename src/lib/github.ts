const API = "https://api.github.com";

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ok(res: Response, op: string): Promise<Response> {
  if (!res.ok) {
    let msg = `${op} failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      const m = body["message"];
      if (m) msg = m;
    } catch {}
    throw new Error(msg);
  }
  return res;
}

type RepoResp = { full_name?: string; default_branch?: string; private?: boolean };
type TreeResp = { tree?: Array<{ path?: string; type?: string; sha?: string }> };
type FileResp = { content?: string; encoding?: string; sha?: string; size?: number };
type CommitResp = Array<{ sha?: string }>;
type PrResp = Array<{
  number?: number;
  title?: string;
  state?: string;
  head?: { ref?: string; sha?: string };
  base?: { ref?: string };
}>;

export type GhPr = {
  number: number;
  title: string;
  state: string;
  head: { ref: string; sha: string };
  base: { ref: string };
};

export type GhTreeItem = { path: string; sha: string };

export function b64encode(text: string): string {
  if (typeof btoa !== "undefined") return btoa(unescape(encodeURIComponent(text)));
  return Buffer.from(text, "utf-8").toString("base64");
}

export function b64decode(data: string): string {
  if (typeof atob !== "undefined") return decodeURIComponent(escape(atob(data)));
  return Buffer.from(data, "base64").toString("utf-8");
}

export function langOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    htm: "html",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    cpp: "cpp",
    c: "c",
    h: "cpp",
    sh: "shell",
    bash: "shell",
    yml: "yaml",
    yaml: "yaml",
    sql: "sql",
    toml: "ini",
    ini: "ini",
    txt: "plaintext",
  };
  return map[ext] ?? "plaintext";
}

export async function ghRepo(token: string, repo: string): Promise<{ full: string; branch: string }> {
  const res = await ok(await fetch(`${API}/repos/${repo}`, { headers: headers(token) }), "Fetch repo");
  const data = (await res.json()) as RepoResp;
  return {
    full: data["full_name"] ?? repo,
    branch: data["default_branch"] ?? "main",
  };
}

export async function ghTree(token: string, repo: string, branch: string): Promise<GhTreeItem[]> {
  const url = `${API}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const res = await ok(await fetch(url, { headers: headers(token) }), "Load repo files");
  const data = (await res.json()) as TreeResp;
  return (data["tree"] ?? [])
    .filter((t) => t["type"] === "blob" && t["path"])
    .map((t) => ({ path: t["path"] as string, sha: t["sha"] ?? "" }));
}

export async function ghFile(token: string, repo: string, path: string, branch: string): Promise<string> {
  const url = `${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const res = await ok(await fetch(url, { headers: headers(token) }), "Load file");
  const data = (await res.json()) as FileResp;
  const content = data["content"];
  if (!content) return "";
  return data["encoding"] === "base64" ? b64decode(content) : content;
}

export async function ghWrite(
  token: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string
): Promise<void> {
  const body: { message: string; content: string; branch: string; sha?: string } = {
    message,
    content: b64encode(content),
    branch,
  };
  if (sha) body["sha"] = sha;
  const res = await ok(
    await fetch(`${API}/repos/${repo}/contents/${path}`, {
      method: "PUT",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    "Commit file"
  );
  await res.json();
}

export async function ghHeadSha(token: string, repo: string, branch: string): Promise<string> {
  const url = `${API}/repos/${repo}/commits/${encodeURIComponent(branch)}?per_page=1`;
  const res = await ok(await fetch(url, { headers: headers(token) }), "Check repo updates");
  const data = (await res.json()) as CommitResp;
  return data[0]?.["sha"] ?? "";
}

export async function ghBranchCreate(token: string, repo: string, newBranch: string, fromSha: string): Promise<void> {
  const res = await ok(
    await fetch(`${API}/repos/${repo}/git/refs`, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: fromSha }),
    }),
    "Create branch"
  );
  await res.json();
}

export async function ghPrs(token: string, repo: string): Promise<GhPr[]> {
  const res = await ok(
    await fetch(`${API}/repos/${repo}/pulls?state=open`, { headers: headers(token) }),
    "Load open PRs"
  );
  const data = (await res.json()) as PrResp;
  return data.flatMap((p) => {
    const number = p["number"];
    const head = p["head"];
    const base = p["base"];
    if (!number || !head || !base) return [];
    return [
      {
        number,
        title: p["title"] ?? `PR #${number}`,
        state: p["state"] ?? "open",
        head: { ref: head["ref"] ?? "", sha: head["sha"] ?? "" },
        base: { ref: base["ref"] ?? "" },
      },
    ];
  });
}

export async function ghPrCreate(
  token: string,
  repo: string,
  title: string,
  head: string,
  base: string,
  body?: string
): Promise<void> {
  const payload: { title: string; head: string; base: string; body?: string } = { title, head, base };
  if (body) payload["body"] = body;
  const res = await ok(
    await fetch(`${API}/repos/${repo}/pulls`, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    "Create PR"
  );
  await res.json();
}

export async function ghPrMerge(token: string, repo: string, number: number): Promise<void> {
  const res = await ok(
    await fetch(`${API}/repos/${repo}/pulls/${number}/merge`, {
      method: "PUT",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ merge_method: "merge" }),
    }),
    "Merge PR"
  );
  await res.json();
}