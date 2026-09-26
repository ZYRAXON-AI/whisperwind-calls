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

export type GhPr = {
  number: number;
  title: string;
  state: string;
  user: { login: string; avatar_url: string };
  head: { ref: string; sha: string };
  base: { ref: string };
  merged_at: string | null;
  comments: number;
  created_at: string;
  updated_at: string;
  html_url: string;
};

export type GhComment = {
  id: number;
  user: { login: string; avatar_url: string };
  body: string;
  created_at: string;
};

export type GhRelease = {
  id: number;
  name: string;
  tag_name: string;
  body: string;
  created_at: string;
  html_url: string;
};

export type GhTreeItem = { path: string; sha: string; size?: number };

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

export async function ghRepo(
  token: string,
  repo: string
): Promise<{ full: string; branch: string; description: string }> {
  const res = await ok(await fetch(`${API}/repos/${repo}`, { headers: headers(token) }), "Fetch repo");
  const data = (await res.json()) as any;
  return {
    full: data["full_name"] ?? repo,
    branch: data["default_branch"] ?? "main",
    description: data["description"] ?? "",
  };
}

export async function ghTree(token: string, repo: string, branch: string): Promise<GhTreeItem[]> {
  const url = `${API}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const res = await ok(await fetch(url, { headers: headers(token) }), "Load repo files");
  const data = (await res.json()) as any;
  return (data["tree"] ?? [])
    .filter((t: any) => t["type"] === "blob" && t["path"])
    .map((t: any) => ({ path: t["path"] as string, sha: t["sha"] ?? "", size: t["size"] }));
}

export async function ghFile(
  token: string,
  repo: string,
  path: string,
  branch: string
): Promise<{ content: string; sha: string }> {
  const url = `${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const res = await ok(await fetch(url, { headers: headers(token) }), "Load file");
  const data = (await res.json()) as any;
  const raw = data["content"] ?? "";
  const content = data["encoding"] === "base64" ? b64decode(raw) : raw;
  return { content, sha: data["sha"] ?? "" };
}

export async function ghWrite(
  token: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch: string,
  sha?: string
): Promise<{ commitSha: string; newSha: string }> {
  let fileSha = sha;
  // If no sha provided, try to fetch the existing file's sha so commit never fails
  if (!fileSha) {
    try {
      const existing = await ghFile(token, repo, path, branch);
      fileSha = existing.sha;
    } catch {
      // New file creation, no sha needed
    }
  }

  const body: { message: string; content: string; branch: string; sha?: string } = {
    message,
    content: b64encode(content),
    branch,
  };
  if (fileSha) body["sha"] = fileSha;

  const res = await ok(
    await fetch(`${API}/repos/${repo}/contents/${path}`, {
      method: "PUT",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    "Commit file"
  );
  const data = (await res.json()) as any;
  return {
    commitSha: data["commit"]?.["sha"] ?? "",
    newSha: data["content"]?.["sha"] ?? "",
  };
}

export async function ghDeleteFile(
  token: string,
  repo: string,
  path: string,
  sha: string,
  message: string,
  branch: string
): Promise<void> {
  await ok(
    await fetch(`${API}/repos/${repo}/contents/${path}`, {
      method: "DELETE",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ message, sha, branch }),
    }),
    "Delete file"
  );
}

export async function ghHeadSha(token: string, repo: string, branch: string): Promise<string> {
  // Method 1: Query git ref directly (returns commit SHA in object.sha)
  try {
    const refUrl = `${API}/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
    const res = await fetch(refUrl, { headers: headers(token) });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data?.object?.sha && data.object.sha.length >= 40) {
        return data.object.sha;
      }
    }
  } catch {}

  // Method 2: Query commits list for this branch
  try {
    const commitsUrl = `${API}/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`;
    const res = await fetch(commitsUrl, { headers: headers(token) });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (Array.isArray(data) && data[0]?.sha && data[0].sha.length >= 40) {
        return data[0].sha;
      }
    }
  } catch {}

  // Method 3: Query single commit endpoint
  try {
    const singleUrl = `${API}/repos/${repo}/commits/${encodeURIComponent(branch)}`;
    const res = await fetch(singleUrl, { headers: headers(token) });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data?.sha && data.sha.length >= 40) {
        return data.sha;
      }
    }
  } catch {}

  return "";
}

export async function ghBranchCreate(token: string, repo: string, newBranch: string, fromSha: string): Promise<void> {
  if (!fromSha || fromSha.length < 40) {
    throw new Error(`Invalid base SHA (${fromSha || "empty"}). Cannot create branch.`);
  }
  await ok(
    await fetch(`${API}/repos/${repo}/git/refs`, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: fromSha }),
    }),
    "Create branch"
  );
}

export async function ghPrs(token: string, repo: string, state: "open" | "closed" | "all" = "all"): Promise<GhPr[]> {
  const res = await ok(
    await fetch(`${API}/repos/${repo}/pulls?state=${state}&per_page=50`, { headers: headers(token) }),
    "Load PRs"
  );
  const data = (await res.json()) as any[];
  return data.map((p) => ({
    number: p["number"] ?? 0,
    title: p["title"] ?? `PR #${p["number"]}`,
    state: p["merged_at"] ? "merged" : (p["state"] ?? "open"),
    user: {
      login: p["user"]?.["login"] ?? "unknown",
      avatar_url: p["user"]?.["avatar_url"] ?? "",
    },
    head: { ref: p["head"]?.["ref"] ?? "", sha: p["head"]?.["sha"] ?? "" },
    base: { ref: p["base"]?.["ref"] ?? "" },
    merged_at: p["merged_at"] ?? null,
    comments: p["comments"] ?? 0,
    created_at: p["created_at"] ?? "",
    updated_at: p["updated_at"] ?? "",
    html_url: p["html_url"] ?? `https://github.com/${repo}/pull/${p["number"]}`,
  }));
}

export async function ghPrCreate(
  token: string,
  repo: string,
  title: string,
  head: string,
  base: string,
  body?: string
): Promise<number> {
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
  const data = (await res.json()) as any;
  return data["number"] ?? 0;
}

export async function ghPrMerge(
  token: string,
  repo: string,
  number: number,
  mergeMethod: "merge" | "squash" | "rebase" = "merge"
): Promise<void> {
  await ok(
    await fetch(`${API}/repos/${repo}/pulls/${number}/merge`, {
      method: "PUT",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ merge_method: mergeMethod }),
    }),
    "Merge PR"
  );
}

export async function ghPrComments(token: string, repo: string, issueNumber: number): Promise<GhComment[]> {
  const res = await ok(
    await fetch(`${API}/repos/${repo}/issues/${issueNumber}/comments`, { headers: headers(token) }),
    "Load comments"
  );
  const data = (await res.json()) as any[];
  return data.map((c) => ({
    id: c["id"],
    user: {
      login: c["user"]?.["login"] ?? "unknown",
      avatar_url: c["user"]?.["avatar_url"] ?? "",
    },
    body: c["body"] ?? "",
    created_at: c["created_at"] ?? "",
  }));
}

export async function ghPrCommentAdd(
  token: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<GhComment> {
  const res = await ok(
    await fetch(`${API}/repos/${repo}/issues/${issueNumber}/comments`, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }),
    "Post comment"
  );
  const c = (await res.json()) as any;
  return {
    id: c["id"],
    user: {
      login: c["user"]?.["login"] ?? "unknown",
      avatar_url: c["user"]?.["avatar_url"] ?? "",
    },
    body: c["body"] ?? "",
    created_at: c["created_at"] ?? "",
  };
}

export async function ghReleases(token: string, repo: string): Promise<GhRelease[]> {
  const res = await ok(
    await fetch(`${API}/repos/${repo}/releases`, { headers: headers(token) }),
    "Load releases"
  );
  const data = (await res.json()) as any[];
  return data.map((r) => ({
    id: r["id"],
    name: r["name"] || r["tag_name"] || "Release",
    tag_name: r["tag_name"] ?? "",
    body: r["body"] ?? "",
    created_at: r["created_at"] ?? "",
    html_url: r["html_url"] ?? "",
  }));
}
