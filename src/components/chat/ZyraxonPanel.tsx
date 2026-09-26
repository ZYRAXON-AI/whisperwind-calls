import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderOpen,
  GitBranch,
  GitMerge,
  GitPullRequest,
  KeyRound,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  RefreshCw,
  Save,
  Search,
  Unlock,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Conversation } from "./Conversation";
import {
  ghBranchCreate,
  ghFile,
  ghHeadSha,
  ghPrCreate,
  ghPrMerge,
  ghPrs,
  ghRepo,
  ghTree,
  ghWrite,
  langOf,
  type GhPr,
  type GhTreeItem,
} from "@/lib/github";
import { ZYRAXON_ROOM, type Profile } from "@/lib/social";

const SECRET = "zyraxonai";
const DEFAULT_REPO = "onelpawarai-X/ZYRAXON-AI";
const TOKEN_KEY = "zyraxon-gh-token";
const SECRET_KEY = "zyraxon-ai-unlocked";
const RECENT_REPOS_KEY = "zyraxon-recent-repos";

// Tree node definition for folders & files
type TreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
};

function buildFolderTree(items: GhTreeItem[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const item of items) {
    const parts = item.path.split("/");
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join("/");

      let existing = currentLevel.find((node) => node.name === part);

      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "folder",
          children: isFile ? undefined : [],
        };
        currentLevel.push(existing);
      }

      if (!isFile && existing.children) {
        currentLevel = existing.children;
      }
    }
  }

  // Sort: folders first, then alphabetically
  const sortTree = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === "folder" ? -1 : 1;
      })
      .map((node) => ({
        ...node,
        children: node.children ? sortTree(node.children) : undefined,
      }));
  };

  return sortTree(root);
}

export function ZyraxonPanel({
  me,
  profiles,
  onOpenProfile,
  active = true,
  onUnread,
}: {
  me: string;
  profiles: Record<string, Profile> | Profile[];
  onOpenProfile: (id: string) => void;
  active?: boolean;
  onUnread?: (threadKey: string, delta: number) => void;
}) {
  const [tab, setTab] = useState<"chat" | "code">("chat");
  const [secret, setSecret] = useState("");
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SECRET_KEY) === "1");

  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [repo, setRepo] = useState(DEFAULT_REPO);
  const [branch, setBranch] = useState("main");
  const [recentRepos, setRecentRepos] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_REPOS_KEY);
      return saved ? JSON.parse(saved) : [DEFAULT_REPO];
    } catch {
      return [DEFAULT_REPO];
    }
  });

  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tree, setTree] = useState<GhTreeItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  const [current, setCurrent] = useState("");
  const [code, setCode] = useState("");
  const [originalCode, setOriginalCode] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [headSha, setHeadSha] = useState("");
  const headShaRef = useRef("");
  const [checking, setChecking] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prs, setPrs] = useState<GhPr[]>([]);
  const [showPrDrawer, setShowPrDrawer] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showFileExplorerMobile, setShowFileExplorerMobile] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  const unlock = () => {
    setUnlocked(true);
    sessionStorage.setItem(SECRET_KEY, "1");
  };

  const saveRecentRepo = (newRepo: string) => {
    setRecentRepos((prev) => {
      const list = [newRepo, ...prev.filter((r) => r !== newRepo)].slice(0, 8);
      localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(list));
      return list;
    });
  };

  const connect = useCallback(async () => {
    if (!token) {
      toast.error("Paste your GitHub access token first");
      return;
    }
    setBusy(true);
    try {
      const info = await ghRepo(token, repo.trim());
      const rawTree = await ghTree(token, info.full, info.branch);
      const sha = await ghHeadSha(token, info.full, info.branch);

      setBranch(info.branch);
      setTree(rawTree);
      setHeadSha(sha);
      headShaRef.current = sha;
      setConnected(true);
      void loadPrs(token);
      localStorage.setItem(TOKEN_KEY, token);
      saveRecentRepo(info.full);

      toast.success(`Connected to ${info.full} (${rawTree.length} files)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect to GitHub");
    } finally {
      setBusy(false);
    }
  }, [token, repo]);

  const loadPrs = useCallback(
    async (tok: string) => {
      try {
        const info = await ghRepo(tok, repo.trim());
        setPrs(await ghPrs(tok, info.full));
      } catch {}
    },
    [repo]
  );

  useEffect(() => {
    if (!connected || !token) return;
    const poll = async () => {
      setChecking(true);
      try {
        const info = await ghRepo(token, repo.trim());
        const sha = await ghHeadSha(token, info.full, info.branch);
        if (sha && sha !== headShaRef.current) {
          headShaRef.current = sha;
          setHeadSha(sha);
          const rawTree = await ghTree(token, info.full, info.branch);
          setTree(rawTree);
          setBranch(info.branch);
          void loadPrs(token);
          toast.info("Repository updated from GitHub — files reloaded");
        }
      } catch {} finally {
        setChecking(false);
      }
    };
    const id = setInterval(poll, 20000);
    return () => clearInterval(id);
  }, [connected, token, repo, loadPrs]);

  async function openFile(path: string) {
    if (!token || !connected) return;
    setBusy(true);
    try {
      const text = await ghFile(token, repo.trim(), path, branch);
      setCurrent(path);
      setCode(text);
      setOriginalCode(text);
      setCommitMsg(`Update ${path.split("/").pop() ?? path}`);
      setEditorKey((k) => k + 1);
      setShowFileExplorerMobile(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open file");
    } finally {
      setBusy(false);
    }
  }

  async function commitToBranch(target: string, sha?: string) {
    if (!token || !current) {
      toast.error("Open a file and write a change first");
      return null;
    }
    const message = commitMsg.trim() || `Update ${current.split("/").pop() ?? current}`;
    await ghWrite(token, repo.trim(), current, code, message, target, sha);
    return message;
  }

  async function commit() {
    if (!current) {
      toast.error("Open a file from the repository first");
      return;
    }
    setCommitting(true);
    try {
      const message = await commitToBranch(branch);
      const info = await ghRepo(token, repo.trim());
      const sha = await ghHeadSha(token, info.full, branch);
      headShaRef.current = sha;
      setHeadSha(sha);
      setOriginalCode(code);
      toast.success(`Committed to ${branch}: ${message}`);
      void loadPrs(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }

  async function prCommit() {
    if (!current) {
      toast.error("Open a file first");
      return;
    }
    if (!prTitle.trim()) {
      toast.error("Give the pull request a title");
      return;
    }
    setCommitting(true);
    try {
      const info = await ghRepo(token, repo.trim());
      const name = newBranch.trim() || `edit-${Date.now().toString(36)}`;
      await ghBranchCreate(token, info.full, name, headShaRef.current);
      await commitToBranch(name);
      await ghPrCreate(token, info.full, prTitle.trim(), name, info.branch);
      toast.success(`PR "${prTitle.trim()}" created successfully!`);
      setPrTitle("");
      setNewBranch("");
      void loadPrs(token);
      setShowPrDrawer(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create PR");
    } finally {
      setCommitting(false);
    }
  }

  async function mergePr(pr: GhPr) {
    setCommitting(true);
    try {
      await ghPrMerge(token, repo.trim(), pr.number);
      toast.success(`PR #${pr.number} merged into ${pr.base.ref}`);
      void loadPrs(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not merge PR");
    } finally {
      setCommitting(false);
    }
  }

  const toggleFolder = (path: string) => {
    setOpenFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const folderTree = useMemo(() => buildFolderTree(tree), [tree]);

  const filteredFlatFiles = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return tree.filter((t) => t.path.toLowerCase().includes(q));
  }, [tree, searchQuery]);

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: TreeNode, depth = 0) => {
    if (node.type === "folder") {
      const isOpen = openFolders[node.path] ?? false;
      return (
        <div key={node.path} className="flex flex-col">
          <button
            type="button"
            onClick={() => toggleFolder(node.path)}
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
            className="flex w-full items-center gap-1.5 rounded-lg py-1 text-left text-xs text-zinc-300 transition hover:bg-white/10"
          >
            {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
            {isOpen ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            )}
            <span className="truncate font-medium">{node.name}</span>
          </button>
          {isOpen && node.children && (
            <div className="flex flex-col">{node.children.map((child) => renderTreeNode(child, depth + 1))}</div>
          )}
        </div>
      );
    }

    const isSelected = current === node.path;
    return (
      <button
        key={node.path}
        type="button"
        onClick={() => void openFile(node.path)}
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
        className={`flex w-full items-center gap-2 rounded-lg py-1 text-left text-xs transition ${
          isSelected ? "bg-primary/25 font-semibold text-white" : "text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
        }`}
      >
        <FileCode className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  };

  const changed = current && code !== originalCode;

  return (
    <div
      className={`flex flex-col gap-2 p-2 sm:p-3 transition-all duration-200 ${
        isFullScreen ? "fixed inset-0 z-50 bg-[#0a0714] p-3" : "h-full"
      }`}
    >
      {/* Top Bar */}
      <div className="glass-strong flex shrink-0 items-center justify-between gap-2 rounded-2xl px-3 py-2 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="gradient-romance grid h-8 w-8 place-items-center rounded-xl text-primary-foreground shadow">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold leading-tight">ZYRAXON-AI Group</h2>
            <p className="text-[11px] text-muted-foreground">
              {unlocked ? "Code Studio & GitHub Workspace" : "Locked Studio"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {tab === "code" && unlocked && (
            <button
              type="button"
              onClick={() => setIsFullScreen((prev) => !prev)}
              title={isFullScreen ? "Exit Fullscreen" : "Maximize Screen"}
              className="glass grid h-8 w-8 place-items-center rounded-xl text-zinc-300 transition hover:bg-white/15"
            >
              {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}

          <div className="flex rounded-xl border border-white/10 bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setTab("chat")}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                tab === "chat" ? "bg-white/15 text-foreground shadow" : "text-muted-foreground hover:bg-white/10"
              }`}
            >
              Group Chat
            </button>
            <button
              type="button"
              onClick={() => setTab("code")}
              className={`flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                tab === "code" ? "bg-white/15 text-foreground shadow" : "text-muted-foreground hover:bg-white/10"
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" /> Code Studio
            </button>
          </div>
        </div>
      </div>

      {/* Group Chat Tab */}
      {tab === "chat" && (
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          <Conversation
            me={me}
            peerId={null}
            profiles={profiles}
            active={active}
            onUnread={onUnread}
            onOpenProfile={onOpenProfile}
            groupKey={ZYRAXON_ROOM}
          />
        </div>
      )}

      {/* Secret Password Gate */}
      {tab === "code" && !unlocked && (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl">
          <div className="glass-strong w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-bold">Secret Code Studio</h3>
            <p className="mt-1 text-xs text-muted-foreground">Enter password to unlock GitHub development workspace.</p>
            <input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && secret.trim().toLowerCase() === SECRET) unlock();
              }}
              type="password"
              placeholder="Enter studio secret"
              className="mt-4 w-full rounded-2xl border border-border bg-input px-4 py-2.5 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => (secret.trim().toLowerCase() === SECRET ? unlock() : toast.error("Wrong secret"))}
              className="gradient-romance mt-3 w-full rounded-2xl px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90"
            >
              Unlock Code Studio
            </button>
          </div>
        </div>
      )}

      {/* Unlocked Code Studio */}
      {tab === "code" && unlocked && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {/* GitHub Connection & Repository Bar */}
          <div className="glass-strong flex flex-wrap items-center gap-2 rounded-2xl p-2 shadow">
            <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-border bg-input px-3 py-1.5">
              <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="owner/repo (e.g. onelpawarai-X/ZYRAXON-AI)"
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
              {recentRepos.length > 1 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setRepo(e.target.value);
                  }}
                  className="bg-transparent text-[11px] text-zinc-400 outline-none"
                >
                  <option value="" disabled>
                    Recent...
                  </option>
                  {recentRepos.map((r) => (
                    <option key={r} value={r} className="bg-zinc-900 text-white">
                      {r}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder="GitHub Personal Access Token"
              className="min-w-[180px] flex-1 rounded-xl border border-border bg-input px-3 py-1.5 text-xs outline-none"
            />

            <button
              type="button"
              onClick={() => void connect()}
              disabled={busy}
              className="gradient-romance flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : connected ? <RefreshCw className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              {connected ? "Sync" : "Connect"}
            </button>

            {prs.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPrDrawer((prev) => !prev)}
                className="flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/30"
              >
                <GitPullRequest className="h-3.5 w-3.5" /> PRs ({prs.length})
              </button>
            )}
          </div>

          {/* Main Workspace (Files Tree + Monaco Editor) */}
          <div className="glass-strong relative flex min-h-0 flex-1 overflow-hidden rounded-2xl shadow">
            {/* Mobile File Explorer Toggle */}
            <div className="absolute left-2 top-2 z-20 sm:hidden">
              <button
                type="button"
                onClick={() => setShowFileExplorerMobile((prev) => !prev)}
                className="glass rounded-lg px-2.5 py-1 text-xs font-medium text-white shadow"
              >
                {showFileExplorerMobile ? "Hide Files" : "📁 Files"}
              </button>
            </div>

            {/* Folder & Files Tree Sidebar */}
            <div
              className={`scroll-soft z-10 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-black/40 p-2 sm:static sm:flex ${
                showFileExplorerMobile ? "absolute inset-y-0 left-0 flex w-72 bg-[#0c0916] shadow-2xl" : "hidden sm:flex"
              }`}
            >
              <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5 text-primary" /> Explorer ({tree.length})
                </span>
                <span className="rounded bg-white/10 px-1 py-0.5 text-[9px] lowercase text-zinc-300">{branch}</span>
              </div>

              {/* Search file */}
              <div className="mb-2 flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/30 px-2 py-1 text-xs">
                <Search className="h-3 w-3 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter files..."
                  className="w-full bg-transparent text-xs text-white outline-none placeholder:text-zinc-500"
                />
              </div>

              {/* Tree view */}
              <div className="flex flex-col gap-0.5">
                {filteredFlatFiles
                  ? filteredFlatFiles.map((f) => (
                      <button
                        key={f.path}
                        type="button"
                        onClick={() => void openFile(f.path)}
                        className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs ${
                          current === f.path ? "bg-primary/25 font-semibold text-white" : "text-zinc-300 hover:bg-white/10"
                        }`}
                      >
                        <FileCode className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span className="truncate">{f.path}</span>
                      </button>
                    ))
                  : folderTree.map((node) => renderTreeNode(node))}
                {tree.length === 0 && (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                    Connect GitHub repository to view files and folders.
                  </p>
                )}
              </div>
            </div>

            {/* Monaco Editor Panel */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Editor Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/20 px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-xs font-medium text-zinc-200">
                    {current ? current : "No file selected"}
                  </span>
                  {changed && (
                    <span className="rounded-full bg-amber-400/20 px-2 py-0.2 text-[10px] font-bold text-amber-300">
                      unsaved
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <input
                    value={prTitle}
                    onChange={(e) => setPrTitle(e.target.value)}
                    placeholder="PR title"
                    className="w-28 rounded-lg border border-border bg-input px-2 py-1 text-[11px] outline-none sm:w-36"
                  />
                  <button
                    type="button"
                    onClick={() => void prCommit()}
                    disabled={committing || !current}
                    className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-40"
                  >
                    {committing ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitPullRequest className="h-3 w-3" />}
                    PR
                  </button>
                </div>
              </div>

              {/* Editor Workspace */}
              {current ? (
                <>
                  <div className="min-h-0 flex-1">
                    <Editor
                      key={editorKey}
                      height="100%"
                      theme="vs-dark"
                      defaultLanguage={langOf(current)}
                      language={langOf(current)}
                      value={code}
                      onChange={(v) => setCode(v ?? "")}
                      options={{
                        minimap: { enabled: true },
                        fontSize: 14,
                        wordWrap: "on",
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2,
                        lineNumbers: "on",
                        smoothScrolling: true,
                        cursorBlinking: "smooth",
                      }}
                    />
                  </div>

                  {/* Commit Toolbar */}
                  <div className="flex items-center gap-2 border-t border-white/10 bg-black/30 p-2">
                    <input
                      value={commitMsg}
                      onChange={(e) => setCommitMsg(e.target.value)}
                      placeholder="Commit message..."
                      className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-1.5 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void commit()}
                      disabled={committing || !changed}
                      className="gradient-romance flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-40"
                    >
                      {committing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Commit ({branch})
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <FileCode className="h-10 w-10 text-zinc-500" />
                  <p className="text-sm font-medium">Pick any file from the explorer to edit</p>
                  <p className="text-xs text-zinc-500">Edit, save, branch and pull-request directly to GitHub</p>
                </div>
              )}
            </div>
          </div>

          {/* Collapsible PR Drawer */}
          {showPrDrawer && (
            <div className="glass-strong rounded-2xl p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold">
                  <GitPullRequest className="h-3.5 w-3.5 text-primary" /> Active Pull Requests ({prs.length})
                </h4>
                <button
                  type="button"
                  onClick={() => setShowPrDrawer(false)}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  ✕ Close
                </button>
              </div>
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                {prs.map((pr) => (
                  <div key={pr.number} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-white">
                        #{pr.number} · {pr.title}
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {pr.head.ref} → {pr.base.ref}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void mergePr(pr)}
                      disabled={committing}
                      className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/30"
                    >
                      <GitMerge className="h-3 w-3" /> Merge
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
