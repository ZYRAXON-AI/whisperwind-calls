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
  Tag,
  Trash2,
  Unlock,
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
      setCurrent(path);
      setCurrentSha(fileData.sha);
      setCode(fileData.content);
      setOriginalCode(fileData.content);
      setCommitMsg(`Update ${path.split("/").pop() ?? path}`);
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
    setCurrent(cleanPath);
    setCurrentSha("");
    setCode("// Write your code here\n");
    setOriginalCode("");
    setCommitMsg(`Add ${cleanPath.split("/").pop() ?? cleanPath}`);
    setEditorKey((k) => k + 1);
    setShowNewFileModal(false);
    setNewFilePath("");
    toast.info(`Created draft for ${cleanPath}. Write and Commit to publish.`);
  }

  async function commit() {
    if (!current) {
      toast.error("Select or create a file first");
      return;
    }
    setCommitting(true);
    try {
      const message = commitMsg.trim() || `Update ${current.split("/").pop() ?? current}`;
      const res = await ghWrite(token, repo.trim(), current, code, message, branch, currentSha || undefined);

      setCurrentSha(res.newSha);
      setOriginalCode(code);

      const info = await ghRepo(token, repo.trim());
      const sha = await ghHeadSha(token, info.full, branch);
      headShaRef.current = sha;
      setHeadSha(sha);

      const updatedTree = await ghTree(token, info.full, branch);
      setTree(updatedTree);

      toast.success(`Committed to ${branch}: ${message}`);
      void loadPrsList(token, info.full);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }

  async function createPullRequest() {
    if (!current) {
      toast.error("Open a file first");
      return;
    }
    if (!prTitle.trim()) {
      toast.error("Please enter a title for the Pull Request");
      return;
    }
    setCommitting(true);
    try {
      const info = await ghRepo(token, repo.trim());
      const branchName = newBranch.trim() || `patch-${Date.now().toString(36)}`;

      await ghBranchCreate(token, info.full, branchName, headShaRef.current);
      await ghWrite(token, info.full, current, code, prTitle.trim(), branchName, currentSha || undefined);
      const prNum = await ghPrCreate(token, info.full, prTitle.trim(), branchName, info.branch);

      toast.success(`Pull Request #${prNum} created successfully!`);
      setPrTitle("");
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
        isFullScreen ? "fixed inset-0 z-50 bg-[#090714] p-3" : "h-full"
      }`}
    >
      {/* Top Header Bar */}
      <div className="glass-strong flex shrink-0 items-center justify-between gap-2 rounded-2xl px-3 py-2 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="gradient-romance grid h-8 w-8 place-items-center rounded-xl text-primary-foreground shadow">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold leading-tight">ZYRAXON AI Multi-Studio</h2>
            <p className="text-[11px] text-muted-foreground">
              {unlocked ? "GitHub Multi-Repository Management" : "Password Protected Studio"}
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

      {/* Secret Gate */}
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

      {/* Unlocked Multi-Project Workspace */}
      {tab === "code" && unlocked && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {/* Multi-Project Tabs & Switcher */}
          <div className="glass-strong flex flex-wrap items-center gap-1.5 rounded-2xl p-2 shadow">
            <div className="scroll-soft flex max-w-full items-center gap-1 overflow-x-auto pb-0.5">
              {managedProjects.map((p) => {
                const isActive = p === repo;
                return (
                  <div
                    key={p}
                    onClick={() => switchProject(p)}
                    className={`group flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold transition ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow"
                        : "bg-white/5 text-zinc-300 hover:bg-white/10"
                    }`}
                  >
                    <GitBranch className="h-3 w-3" />
                    <span className="max-w-[140px] truncate">{p}</span>
                    {managedProjects.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => removeProject(p, e)}
                        className="rounded p-0.5 opacity-60 hover:bg-black/20 hover:opacity-100"
                        title="Close Project"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => setShowAddProject((prev) => !prev)}
                className="flex items-center gap-1 rounded-xl border border-dashed border-white/20 bg-white/5 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-white/10"
              >
                <Plus className="h-3 w-3" /> Add Project
              </button>
            </div>

            {/* Quick Add Project Dropdown/Input */}
            {showAddProject && (
              <div className="flex w-full items-center gap-2 pt-1 sm:w-auto">
                <input
                  value={newRepoInput}
                  onChange={(e) => setNewRepoInput(e.target.value)}
                  placeholder="owner/repository"
                  className="rounded-xl border border-border bg-input px-3 py-1 text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={addProject}
                  className="gradient-romance rounded-xl px-3 py-1 text-xs font-semibold text-white"
                >
                  Add
                </button>
              </div>
            )}

            {/* Token & Connection */}
            <div className="ml-auto flex items-center gap-2">
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                type="password"
                placeholder="GitHub Token"
                className="w-32 rounded-xl border border-border bg-input px-2.5 py-1 text-xs outline-none sm:w-48"
              />
              <button
                type="button"
                onClick={() => void connect()}
                disabled={busy}
                className="gradient-romance flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-semibold text-white shadow hover:opacity-90 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {connected ? "Sync" : "Connect"}
              </button>
            </div>
          </div>

          {/* Sub Navigation (Editor | PRs Table | Releases) */}
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
              <button
                type="button"
                onClick={() => setStudioView("editor")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  studioView === "editor" ? "bg-white/20 text-white shadow" : "text-zinc-400 hover:text-white"
                }`}
              >
                Code Editor
              </button>
              <button
                type="button"
                onClick={() => {
                  setStudioView("prs");
                  void loadPrsList(token, repo);
                }}
                className={`flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  studioView === "prs" ? "bg-white/20 text-white shadow" : "text-zinc-400 hover:text-white"
                }`}
              >
                <GitPullRequest className="h-3 w-3 text-emerald-400" />
                Pull Requests ({prs.length})
              </button>
              <button
                type="button"
                onClick={() => void loadReleasesList()}
                className={`flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                  studioView === "releases" ? "bg-white/20 text-white shadow" : "text-zinc-400 hover:text-white"
                }`}
              >
                <Tag className="h-3 w-3 text-amber-400" /> Releases
              </button>
            </div>

            <div className="flex items-center gap-1 text-xs text-zinc-400">
              <span className="font-mono text-zinc-300">{repo}</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">{branch}</span>
            </div>
          </div>

          {/* VIEW 1: CODE EDITOR */}
          {studioView === "editor" && (
            <div className="glass-strong relative flex min-h-0 flex-1 overflow-hidden rounded-2xl shadow">
              {/* Mobile toggle */}
              <div className="absolute left-2 top-2 z-20 sm:hidden">
                <button
                  type="button"
                  onClick={() => setShowFileExplorerMobile((prev) => !prev)}
                  className="glass rounded-lg px-2.5 py-1 text-xs font-medium text-white shadow"
                >
                  {showFileExplorerMobile ? "Hide Files" : "📁 Files"}
                </button>
              </div>

              {/* Sidebar Explorer */}
              <div
                className={`scroll-soft z-10 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-black/40 p-2 sm:static sm:flex ${
                  showFileExplorerMobile
                    ? "absolute inset-y-0 left-0 flex w-72 bg-[#0c0916] shadow-2xl"
                    : "hidden sm:flex"
                }`}
              >
                <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5 text-primary" /> Explorer ({tree.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowNewFileModal(true)}
                    className="flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] normal-case text-zinc-200 transition hover:bg-primary hover:text-white"
                    title="Create New File"
                  >
                    <FilePlus className="h-3 w-3" /> + File
                  </button>
                </div>

                {/* Filter */}
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

                {/* Tree */}
                <div className="flex flex-col gap-0.5">
                  {filteredFlatFiles
                    ? filteredFlatFiles.map((f) => (
                        <button
                          key={f.path}
                          type="button"
                          onClick={() => void openFile(f.path)}
                          className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs ${
                            current === f.path
                              ? "bg-primary/25 font-semibold text-white"
                              : "text-zinc-300 hover:bg-white/10"
                          }`}
                        >
                          <FileCode className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="truncate">{f.path}</span>
                        </button>
                      ))
                    : folderTree.map((node) => renderTreeNode(node))}
                  {tree.length === 0 && (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                      No files loaded. Connect with GitHub Token.
                    </p>
                  )}
                </div>
              </div>

              {/* Monaco Editor Pane */}
              <div className="flex min-w-0 flex-1 flex-col">
                {/* Editor Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/20 px-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-xs font-medium text-zinc-200">
                      {current || "No file opened"}
                    </span>
                    {changed ? (
                      <span className="flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Unsaved changes
                      </span>
                    ) : current ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        <Check className="h-2.5 w-2.5" /> Synced
                      </span>
                    ) : null}
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
