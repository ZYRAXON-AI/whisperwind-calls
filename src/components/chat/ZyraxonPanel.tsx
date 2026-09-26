import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileCode,
  FilePlus,
  Folder,
  FolderOpen,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  KeyRound,
  Loader2,
  Lock,
  Maximize2,
  MessageSquare,
  Minimize2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Tag,
  Trash2,
  Unlock,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Conversation } from "./Conversation";
import {
  ghBranchCreate,
  ghFile,
  ghHeadSha,
  ghPrCommentAdd,
  ghPrComments,
  ghPrCreate,
  ghPrMerge,
  ghPrs,
  ghReleases,
  ghRepo,
  ghTree,
  ghWrite,
  langOf,
  type GhComment,
  type GhPr,
  type GhRelease,
  type GhTreeItem,
} from "@/lib/github";
import { ZYRAXON_ROOM, type Profile } from "@/lib/social";

const SECRET = "zyraxonai";
const DEFAULT_REPO = "onelpawarai-X/ZYRAXON-AI";
const TOKEN_KEY = "zyraxon-gh-token";
const SECRET_KEY = "zyraxon-ai-unlocked";
const MANAGED_PROJECTS_KEY = "zyraxon-managed-projects";
const ACTIVE_REPO_KEY = "zyraxon-active-repo";

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
  const [studioView, setStudioView] = useState<"editor" | "prs" | "releases">("editor");

  const [secret, setSecret] = useState("");
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SECRET_KEY) === "1");
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");

  // Multiple Projects / Repositories Management
  const [managedProjects, setManagedProjects] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(MANAGED_PROJECTS_KEY);
      return saved ? JSON.parse(saved) : [DEFAULT_REPO];
    } catch {
      return [DEFAULT_REPO];
    }
  });

  const [repo, setRepo] = useState(() => localStorage.getItem(ACTIVE_REPO_KEY) || DEFAULT_REPO);
  const [newRepoInput, setNewRepoInput] = useState("");
  const [showAddProject, setShowAddProject] = useState(false);

  const [branch, setBranch] = useState("main");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tree, setTree] = useState<GhTreeItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  // Editor states
  const [current, setCurrent] = useState("");
  const [currentSha, setCurrentSha] = useState("");
  const [code, setCode] = useState("");
  const [originalCode, setOriginalCode] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [headSha, setHeadSha] = useState("");
  const headShaRef = useRef("");
  const [newBranch, setNewBranch] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showFileExplorerMobile, setShowFileExplorerMobile] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  // New file modal
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");

  // Pull Requests Table & Commenting states
  const [prs, setPrs] = useState<GhPr[]>([]);
  const [prFilter, setPrFilter] = useState<"all" | "open" | "closed">("all");
  const [activePr, setActivePr] = useState<GhPr | null>(null);
  const [comments, setComments] = useState<GhComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("merge");

  // Releases
  const [releases, setReleases] = useState<GhRelease[]>([]);

  const unlock = () => {
    setUnlocked(true);
    sessionStorage.setItem(SECRET_KEY, "1");
  };

  const saveProjects = (list: string[]) => {
    setManagedProjects(list);
    localStorage.setItem(MANAGED_PROJECTS_KEY, JSON.stringify(list));
  };

  const switchProject = (targetRepo: string) => {
    setRepo(targetRepo);
    localStorage.setItem(ACTIVE_REPO_KEY, targetRepo);
    setCurrent("");
    setCurrentSha("");
    setCode("");
    setOriginalCode("");
    setPrTitle("");
    setCommitMsg("");
  };

  const addProject = () => {
    const trimmed = newRepoInput.trim();
    if (!trimmed || !trimmed.includes("/")) {
      toast.error("Enter repository in 'owner/repo' format");
      return;
    }
    if (!managedProjects.includes(trimmed)) {
      const next = [...managedProjects, trimmed];
      saveProjects(next);
    }
    switchProject(trimmed);
    setNewRepoInput("");
    setShowAddProject(false);
    toast.success(`Added ${trimmed}`);
  };

  const removeProject = (targetRepo: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (managedProjects.length <= 1) {
      toast.error("Keep at least one repository");
      return;
    }
    const next = managedProjects.filter((r) => r !== targetRepo);
    saveProjects(next);
    if (repo === targetRepo) {
      switchProject(next[0]);
    }
  };

  const loadPrsList = useCallback(
    async (tok: string, targetRepo: string) => {
      try {
        const list = await ghPrs(tok, targetRepo, "all");
        setPrs(list);
      } catch {}
    },
    []
  );

  const connect = useCallback(async () => {
    if (!token) {
      toast.error("Enter your GitHub Personal Access Token first");
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

      void loadPrsList(token, info.full);
      localStorage.setItem(TOKEN_KEY, token);

      if (!managedProjects.includes(info.full)) {
        saveProjects([...managedProjects, info.full]);
      }

      toast.success(`Connected: ${info.full} (${rawTree.length} files)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "GitHub connection failed");
    } finally {
      setBusy(false);
    }
  }, [token, repo, managedProjects, loadPrsList]);

  // Connect automatically when repo or token is available
  useEffect(() => {
    if (token && repo && unlocked && tab === "code") {
      void connect();
    }
  }, [repo, unlocked, tab]);

  async function openFile(path: string) {
    if (!token) return;
    setBusy(true);
    try {
      const fileData = await ghFile(token, repo.trim(), path, branch);
      const fileName = path.split("/").pop() ?? path;
      setCurrent(path);
      setCurrentSha(fileData.sha);
      setCode(fileData.content);
      setOriginalCode(fileData.content);
      setCommitMsg(`Update ${fileName}`);
      setPrTitle(`Update ${fileName}`);
      setEditorKey((k) => k + 1);
      setShowFileExplorerMobile(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open file");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateNewFile() {
    if (!newFilePath.trim()) {
      toast.error("Enter a valid file path");
      return;
    }
    const cleanPath = newFilePath.trim().replace(/^\/+/, "");
    const fileName = cleanPath.split("/").pop() ?? cleanPath;
    setCurrent(cleanPath);
    setCurrentSha("");
    setCode("// Write your code here\n");
    setOriginalCode("");
    setCommitMsg(`Add ${fileName}`);
    setPrTitle(`Add ${fileName}`);
    setEditorKey((k) => k + 1);
    setShowNewFileModal(false);
    setNewFilePath("");
    toast.info(`Created draft for ${cleanPath}. Push to publish.`);
  }

  // Direct Push to current branch
  async function commit() {
    if (!current) {
      toast.error("Select or create a file first");
      return;
    }
    setCommitting(true);
    try {
      const fileName = current.split("/").pop() ?? current;
      const message = commitMsg.trim() || `Update ${fileName}`;
      const res = await ghWrite(token, repo.trim(), current, code, message, branch, currentSha || undefined);

      setCurrentSha(res.newSha);
      setOriginalCode(code);

      const info = await ghRepo(token, repo.trim());
      const sha = await ghHeadSha(token, info.full, branch);
      headShaRef.current = sha;
      setHeadSha(sha);

      const updatedTree = await ghTree(token, info.full, branch);
      setTree(updatedTree);

      toast.success(`Directly pushed to ${branch}: ${message}`);
      void loadPrsList(token, info.full);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Direct Push failed");
    } finally {
      setCommitting(false);
    }
  }

  // Create Pull Request with auto-title and auto-branch
  async function createPullRequest() {
    if (!current) {
      toast.error("Open a file first");
      return;
    }
    const fileName = current.split("/").pop() ?? current;
    const finalPrTitle = prTitle.trim() || commitMsg.trim() || `Update ${fileName}`;
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    const branchName = newBranch.trim() || `patch-${cleanFileName}-${Date.now().toString(36)}`;

    setCommitting(true);
    try {
      const info = await ghRepo(token, repo.trim());

      // Fetch fresh 40-character base SHA to ensure zero validation errors
      let baseSha = headShaRef.current;
      if (!baseSha || baseSha.length < 40) {
        baseSha = await ghHeadSha(token, info.full, info.branch);
      }
      if (!baseSha || baseSha.length < 40) {
        throw new Error("Could not fetch 40-character base commit SHA. Check branch name & permissions.");
      }

      await ghBranchCreate(token, info.full, branchName, baseSha);
      await ghWrite(token, info.full, current, code, finalPrTitle, branchName, currentSha || undefined);
      const prNum = await ghPrCreate(token, info.full, finalPrTitle, branchName, info.branch);

      toast.success(`Pull Request #${prNum} created successfully!`);
      setPrTitle(`Update ${fileName}`);
      setNewBranch("");
      setStudioView("prs");
      void loadPrsList(token, info.full);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create PR");
    } finally {
      setCommitting(false);
    }
  }

  async function handleMergePr(pr: GhPr) {
    setCommitting(true);
    try {
      await ghPrMerge(token, repo.trim(), pr.number, mergeMethod);
      toast.success(`PR #${pr.number} merged into ${pr.base.ref}!`);
      void loadPrsList(token, repo.trim());
      if (activePr?.number === pr.number) {
        setActivePr({ ...activePr, state: "merged" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setCommitting(false);
    }
  }

  async function openPrDetails(pr: GhPr) {
    setActivePr(pr);
    setLoadingComments(true);
    try {
      const comms = await ghPrComments(token, repo.trim(), pr.number);
      setComments(comms);
    } catch {
      toast.error("Could not load comments");
    } finally {
      setLoadingComments(false);
    }
  }

  async function handlePostComment() {
    if (!activePr || !newComment.trim()) return;
    try {
      const posted = await ghPrCommentAdd(token, repo.trim(), activePr.number, newComment.trim());
      setComments((prev) => [...prev, posted]);
      setNewComment("");
      toast.success("Comment sent to GitHub!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to post comment");
    }
  }

  async function loadReleasesList() {
    setStudioView("releases");
    if (!token) return;
    try {
      const rels = await ghReleases(token, repo.trim());
      setReleases(rels);
    } catch {}
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

  const filteredPrs = useMemo(() => {
    if (prFilter === "all") return prs;
    if (prFilter === "open") return prs.filter((p) => p.state === "open");
    return prs.filter((p) => p.state === "closed" || p.state === "merged");
  }, [prs, prFilter]);

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
              <Folder className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            )}
            <span className="truncate">{node.name}</span>
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
        style={{ paddingLeft: `${depth * 12 + 18}px` }}
        className={`flex w-full items-center gap-1.5 rounded-lg py-1 text-left text-xs transition ${
          isSelected ? "gradient-romance font-semibold text-white shadow" : "text-zinc-400 hover:bg-white/10 hover:text-white"
        }`}
      >
        <FileCode className="h-3 w-3 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  };

  const changed = code !== originalCode;

  return (
    <div
      className={`flex flex-col ${
        isFullScreen
          ? "fixed inset-0 z-50 bg-[#07050d] p-3 backdrop-blur-md"
          : "h-full w-full"
      }`}
    >
      {/* Top Navigation Bar */}
      <header className="glass-strong mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2 shadow">
        <div className="flex items-center gap-2">
          <div className="gradient-romance flex h-7 w-7 items-center justify-center rounded-xl text-primary-foreground shadow">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-xs font-bold tracking-tight text-foreground sm:text-sm">ZYRAXON AI Multi-Studio</h2>
            <p className="text-[10px] text-muted-foreground">GitHub Multi-Repository Management</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {tab === "code" && (
            <button
              type="button"
              onClick={() => setIsFullScreen((v) => !v)}
              className="glass rounded-xl p-1.5 text-zinc-300 hover:bg-white/15"
              title={isFullScreen ? "Exit Fullscreen" : "Maximize Studio"}
            >
              {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}

          <div className="flex rounded-xl bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setTab("chat")}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                tab === "chat" ? "gradient-romance text-white shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Group Chat
            </button>
            <button
              type="button"
              onClick={() => setTab("code")}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                tab === "code" ? "gradient-romance text-white shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Code Studio
            </button>
          </div>
        </div>
      </header>

      {/* TAB 1: GROUP CHAT */}
      {tab === "chat" && (
        <div className="glass-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl shadow">
          <Conversation
            me={me}
            peerId={null}
            profiles={profiles}
            onOpenProfile={onOpenProfile}
            active={active}
            onUnread={onUnread}
            groupKey={ZYRAXON_ROOM}
          />
        </div>
      )}

      {/* TAB 2: CODE STUDIO */}
      {tab === "code" && !unlocked && (
        <div className="glass-strong flex flex-1 items-center justify-center rounded-2xl p-6 text-center shadow">
          <div className="w-full max-w-sm space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">ZYRAXON Code Studio Locked</h3>
              <p className="text-xs text-muted-foreground">Enter your developer access code to open GitHub Studio.</p>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && secret === SECRET) unlock();
                }}
                placeholder="Access key..."
                className="flex-1 rounded-xl border border-border bg-input px-3 py-2 text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (secret === SECRET) unlock();
                  else toast.error("Incorrect key");
                }}
                className="gradient-romance rounded-xl px-4 py-2 text-xs font-semibold text-primary-foreground shadow"
              >
                <Unlock className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "code" && unlocked && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {/* Multi-Project Tabs Bar */}
          <div className="glass-strong flex items-center gap-1.5 overflow-x-auto rounded-2xl p-1.5 shadow scroll-soft">
            {managedProjects.map((proj) => {
              const isActive = repo === proj;
              return (
                <div
                  key={proj}
                  onClick={() => switchProject(proj)}
                  className={`group flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold transition ${
                    isActive
                      ? "gradient-romance text-white shadow"
                      : "bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <GitBranch className="h-3 w-3 shrink-0" />
                  <span className="max-w-[130px] truncate">{proj}</span>
                  {managedProjects.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => removeProject(proj, e)}
                      className="opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              );
            })}

            {showAddProject ? (
              <div className="flex items-center gap-1">
                <input
                  value={newRepoInput}
                  onChange={(e) => setNewRepoInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addProject();
                    if (e.key === "Escape") setShowAddProject(false);
                  }}
                  placeholder="owner/repo"
                  className="w-28 rounded-lg border border-border bg-input px-2 py-0.5 text-xs text-white outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={addProject}
                  className="rounded-lg bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddProject(false)}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddProject(true)}
                className="flex items-center gap-1 rounded-xl bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-400 transition hover:bg-white/10 hover:text-white"
              >
                <Plus className="h-3 w-3" /> Add Project
              </button>
            )}

            <div className="ml-auto flex items-center gap-1.5 pl-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="GitHub PAT (ghp_...)"
                className="w-32 rounded-xl border border-border bg-input px-2 py-1 text-[11px] outline-none sm:w-44"
              />
              <button
                type="button"
                onClick={() => void connect()}
                disabled={busy}
                className="gradient-romance flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Sync
              </button>
            </div>
          </div>

          {/* Sub Navigation (Editor vs PRs vs Releases) */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setStudioView("editor")}
                className={`rounded-xl px-3 py-1 text-xs font-semibold transition ${
                  studioView === "editor" ? "bg-white/20 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                Code Editor
              </button>
              <button
                type="button"
                onClick={() => setStudioView("prs")}
                className={`flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-semibold transition ${
                  studioView === "prs" ? "bg-white/20 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                <GitPullRequest className="h-3 w-3" /> Pull Requests ({prs.length})
              </button>
              <button
                type="button"
                onClick={() => void loadReleasesList()}
                className={`flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-semibold transition ${
                  studioView === "releases" ? "bg-white/20 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                <Tag className="h-3 w-3" /> Releases
              </button>
            </div>

            <span className="hidden text-[11px] font-mono text-zinc-400 sm:inline">
              {repo} <span className="text-zinc-600">/</span> {branch}
            </span>
          </div>

          {/* VIEW 1: MONACO CODE EDITOR */}
          {studioView === "editor" && (
            <div className="relative flex min-h-0 flex-1 gap-2 overflow-hidden">
              {/* File Explorer Sidebar */}
              <div
                className={`glass-strong flex flex-col rounded-2xl shadow transition-all ${
                  showFileExplorerMobile
                    ? "fixed inset-y-16 left-2 right-2 z-40 bg-[#0d091a] p-3"
                    : "hidden sm:flex sm:w-64"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-1 border-b border-white/10 pb-2">
                  <span className="text-xs font-bold text-zinc-200">Files ({tree.length})</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowNewFileModal(true)}
                      className="flex items-center gap-1 rounded-lg bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/30"
                    >
                      <FilePlus className="h-3 w-3" /> + File
                    </button>
                    {showFileExplorerMobile && (
                      <button
                        type="button"
                        onClick={() => setShowFileExplorerMobile(false)}
                        className="rounded-lg p-1 text-zinc-400 hover:text-white sm:hidden"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search files..."
                    className="w-full rounded-xl border border-white/10 bg-black/40 py-1.5 pl-8 pr-2 text-xs text-white outline-none"
                  />
                </div>

                <div className="scroll-soft min-h-0 flex-1 overflow-y-auto pr-1">
                  {filteredFlatFiles ? (
                    <div className="flex flex-col gap-0.5">
                      {filteredFlatFiles.map((item) => (
                        <button
                          key={item.path}
                          type="button"
                          onClick={() => void openFile(item.path)}
                          className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs ${
                            current === item.path ? "gradient-romance text-white" : "text-zinc-300 hover:bg-white/10"
                          }`}
                        >
                          <FileCode className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.path}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">{folderTree.map((node) => renderTreeNode(node))}</div>
                  )}
                </div>
              </div>

              {/* Main Monaco Editor Canvas */}
              <div className="glass-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl shadow">
                {/* Editor Header */}
                <div className="flex items-center justify-between border-b border-white/10 bg-black/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowFileExplorerMobile(true)}
                      className="rounded-lg bg-white/10 p-1 text-xs text-zinc-300 sm:hidden"
                    >
                      Files
                    </button>
                    <span className="text-xs font-semibold text-white truncate max-w-[140px] sm:max-w-xs">
                      {current || "No file opened"}
                    </span>
                    {changed ? (
                      <span className="flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Unsaved
                      </span>
                    ) : current ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        <Check className="h-2.5 w-2.5" /> Synced
                      </span>
                    ) : null}
                  </div>

                  {/* PR Creation Header Trigger */}
                  <div className="flex items-center gap-1.5">
                    <input
                      value={prTitle}
                      onChange={(e) => setPrTitle(e.target.value)}
                      placeholder={current ? `Update ${current.split("/").pop()}` : "PR title"}
                      className="w-28 rounded-lg border border-border bg-input px-2 py-1 text-[11px] outline-none sm:w-44"
                    />
                    <button
                      type="button"
                      onClick={() => void createPullRequest()}
                      disabled={committing || !current}
                      className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-40"
                    >
                      {committing ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitPullRequest className="h-3 w-3" />}
                      Create PR
                    </button>
                  </div>
                </div>

                {/* Monaco Canvas */}
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
                        onChange={(v) => {
                          const val = v ?? "";
                          setCode(val);
                        }}
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

                    {/* Push / Commit Toolbar */}
                    <div className="flex items-center gap-2 border-t border-white/10 bg-black/40 p-2">
                      <input
                        value={commitMsg}
                        onChange={(e) => setCommitMsg(e.target.value)}
                        placeholder={`Commit message (default: Update ${current.split("/").pop() ?? current})`}
                        className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-1.5 text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void commit()}
                        disabled={committing || !current}
                        className="gradient-romance flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-40"
                      >
                        {committing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UploadCloud className="h-3.5 w-3.5" />
                        )}
                        Push to {branch}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground p-6 text-center">
                    <FileCode className="h-12 w-12 text-zinc-500" />
                    <p className="text-sm font-semibold text-zinc-200">Select any file from Explorer or click "+ File"</p>
                    <p className="text-xs text-zinc-400 max-w-sm">
                      Edit, create branches, push commits, and open pull requests directly from your browser.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW 2: PULL REQUESTS TABLE & COMMENTING */}
          {studioView === "prs" && (
            <div className="glass-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl shadow">
              {/* PR Header & Filter */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/30 p-3">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Pull Requests ({filteredPrs.length})</h3>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex rounded-xl bg-white/5 p-0.5">
                    <button
                      type="button"
                      onClick={() => setPrFilter("all")}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        prFilter === "all" ? "bg-white/20 text-white" : "text-zinc-400"
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrFilter("open")}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        prFilter === "open" ? "bg-emerald-500/20 text-emerald-300 font-semibold" : "text-zinc-400"
                      }`}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrFilter("closed")}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                        prFilter === "closed" ? "bg-purple-500/20 text-purple-300 font-semibold" : "text-zinc-400"
                      }`}
                    >
                      Merged / Closed
                    </button>
                  </div>

                  <select
                    value={mergeMethod}
                    onChange={(e: any) => setMergeMethod(e.target.value)}
                    className="rounded-xl border border-white/10 bg-black/50 px-2 py-1 text-xs text-zinc-300 outline-none"
                  >
                    <option value="merge">Create Merge Commit</option>
                    <option value="squash">Squash and Merge</option>
                    <option value="rebase">Rebase and Merge</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => void loadPrsList(token, repo)}
                    className="glass rounded-xl p-1.5 text-zinc-300 transition hover:bg-white/15"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Table Container */}
              <div className="scroll-soft min-h-0 flex-1 overflow-auto p-3">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-zinc-400">
                      <th className="pb-2 font-medium">PR</th>
                      <th className="pb-2 font-medium">Branches</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Author</th>
                      <th className="pb-2 font-medium">Updated</th>
                      <th className="pb-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredPrs.map((p) => {
                      const isMerged = p.state === "merged";
                      const isOpen = p.state === "open";
                      return (
                        <tr key={p.number} className="transition hover:bg-white/5">
                          <td className="py-2.5 pr-2">
                            <button
                              type="button"
                              onClick={() => void openPrDetails(p)}
                              className="text-left font-semibold text-white hover:text-primary transition"
                            >
                              <span className="text-zinc-400 font-mono">#{p.number}</span> {p.title}
                            </button>
                          </td>
                          <td className="py-2.5 pr-2 font-mono text-[11px] text-zinc-300">
                            <span className="rounded bg-white/10 px-1 py-0.5">{p.head.ref}</span>
                            <span className="mx-1 text-zinc-500">→</span>
                            <span className="rounded bg-white/10 px-1 py-0.5">{p.base.ref}</span>
                          </td>
                          <td className="py-2.5 pr-2">
                            {isMerged ? (
                              <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                                Merged
                              </span>
                            ) : isOpen ? (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                Open
                              </span>
                            ) : (
                              <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-[10px] font-bold text-zinc-300">
                                Closed
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-2 text-zinc-300">
                            <div className="flex items-center gap-1.5">
                              {p.user.avatar_url && (
                                <img src={p.user.avatar_url} alt="" className="h-4 w-4 rounded-full" />
                              )}
                              <span>{p.user.login}</span>
                            </div>
                          </td>
                          <td className="py-2.5 pr-2 text-zinc-400 text-[11px]">
                            {new Date(p.updated_at || p.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => void openPrDetails(p)}
                                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-200 transition hover:bg-white/15"
                              >
                                <MessageSquare className="h-3 w-3" /> Details
                              </button>
                              {isOpen && (
                                <button
                                  type="button"
                                  onClick={() => void handleMergePr(p)}
                                  disabled={committing}
                                  className="flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/30"
                                >
                                  <GitMerge className="h-3 w-3" /> Merge
                                </button>
                              )}
                              <a
                                href={p.html_url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg p-1 text-zinc-400 hover:text-white"
                                title="Open in GitHub"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {filteredPrs.length === 0 && (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    No pull requests found for this repository.
                  </p>
                )}
              </div>

              {/* PR Detail & Commenting Drawer */}
              {activePr && (
                <div className="border-t border-white/10 bg-[#090714] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 text-xs font-bold text-white">
                      <GitPullRequest className="h-4 w-4 text-emerald-400" />
                      #{activePr.number} · {activePr.title}
                    </h4>
                    <button
                      type="button"
                      onClick={() => setActivePr(null)}
                      className="text-xs text-zinc-400 hover:text-white"
                    >
                      ✕ Close
                    </button>
                  </div>

                  {/* Comments scroll */}
                  <div className="scroll-soft mb-2 max-h-40 flex flex-col gap-2 overflow-y-auto rounded-xl bg-black/40 p-2">
                    {loadingComments ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      </div>
                    ) : comments.length === 0 ? (
                      <p className="py-2 text-center text-xs text-zinc-500">No comments yet on this PR.</p>
                    ) : (
                      comments.map((c) => (
                        <div key={c.id} className="rounded-lg bg-white/5 p-2 text-xs">
                          <div className="mb-1 flex items-center gap-1.5 font-semibold text-zinc-300">
                            {c.user.avatar_url && (
                              <img src={c.user.avatar_url} alt="" className="h-3.5 w-3.5 rounded-full" />
                            )}
                            <span>{c.user.login}</span>
                            <span className="text-[10px] text-zinc-500">
                              {new Date(c.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-zinc-200">{c.body}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Reply Input Box */}
                  <div className="flex items-center gap-2">
                    <input
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handlePostComment();
                        }
                      }}
                      placeholder="Write a reply or review comment..."
                      className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-1.5 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void handlePostComment()}
                      disabled={!newComment.trim()}
                      className="gradient-romance flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-white shadow hover:opacity-90 disabled:opacity-40"
                    >
                      <Send className="h-3 w-3" /> Reply
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 3: RELEASES */}
          {studioView === "releases" && (
            <div className="glass-strong flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl p-3 shadow">
              <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                  <Tag className="h-4 w-4 text-amber-400" /> Releases & Tags ({releases.length})
                </h3>
              </div>
              <div className="scroll-soft min-h-0 flex-1 overflow-y-auto flex flex-col gap-2">
                {releases.map((rel) => (
                  <div key={rel.id} className="rounded-xl bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{rel.name}</span>
                      <span className="rounded bg-amber-400/20 px-2 py-0.5 text-xs font-mono text-amber-300">
                        {rel.tag_name}
                      </span>
                    </div>
                    {rel.body && <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-300">{rel.body}</p>}
                    <div className="mt-2 text-[11px] text-zinc-500">
                      Released on {new Date(rel.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
                {releases.length === 0 && (
                  <p className="py-10 text-center text-xs text-zinc-400">No releases published yet on GitHub.</p>
                )}
              </div>
            </div>
          )}

          {/* Modal: Create New File */}
          {showNewFileModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
              <div className="glass-strong w-full max-w-sm rounded-3xl p-5 shadow-2xl">
                <h4 className="text-sm font-bold text-white mb-2">Create New File</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Specify filename or path (e.g. <code>src/utils/helper.ts</code>):
                </p>
                <input
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="src/components/MyNewFile.tsx"
                  className="w-full rounded-xl border border-border bg-input px-3 py-2 text-xs outline-none mb-3"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewFileModal(false)}
                    className="rounded-xl px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreateNewFile()}
                    className="gradient-romance rounded-xl px-4 py-1.5 text-xs font-semibold text-white shadow"
                  >
                    Create & Open
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
