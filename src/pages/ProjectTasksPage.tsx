import React, { useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, FolderOpen, ChevronDown, Plus, Search, Loader2, Layers, Sparkles } from 'lucide-react';
import KanbanBoard from '@/components/KanbanBoard';
import type { KanbanBoardRef } from '@/components/KanbanBoard';
import BulkCreateDialog from '@/components/BulkCreateDialog';
import ImportMarkdownDialog from '@/components/ImportMarkdownDialog';
import { Button } from '@/components/ui/button';
import TimerStartButton from '@/components/TimerStartButton';
import { useTaskStore } from '@/store/taskStore';
import { useProjectStore } from '@/store/projectStore';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

export default function ProjectTasksPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const boardRef = React.useRef<KanbanBoardRef>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);
  const [importDialogOpen, setImportDialogOpen] = React.useState(false);
  const { resetParams, silentFetch } = useTaskStore();
  const projects = useProjectStore((s) => s.projects);
  const hasFetched = useProjectStore((s) => s.hasFetched);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const projectsLoading = useProjectStore((s) => s.loading);

  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const [switcherSearch, setSwitcherSearch] = React.useState('');

  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id ?? currentUser?._id;

  const activeProjects = useMemo(
    () => projects.filter((p) => !p.archivedAt && !p.deletedAt),
    [projects]
  );

  const currentProject = activeProjects.find((p) => p.id === projectId);
  const projectName = currentProject?.name;

  const myMemberRole = currentProject?.members?.find((m) => m.profileId === currentUserId)?.role;
  const visibilitySource = currentProject?.visibilitySource ?? 'MEMBER';
  const isReadOnly = visibilitySource === 'DEPARTMENT';
  const canEditTasks = !isReadOnly && visibilitySource === 'MEMBER' && myMemberRole !== 'VIEWER';
  const canDeleteTasks = !isReadOnly && visibilitySource === 'MEMBER' && (myMemberRole === 'MANAGER' || myMemberRole === 'OWNER');
  const canAssign = canDeleteTasks;

  const filteredProjects = activeProjects.filter((p) =>
    p.name.toLowerCase().includes(switcherSearch.toLowerCase())
  );

  React.useEffect(() => {
    if (projectId) {
      resetParams({ projectId });
    }
  }, [projectId, resetParams]);

  // If project not found in store after initial fetch, re-fetch the list once.
  // Covers: (1) user added as member after session started, (2) stale store after account switch.
  React.useEffect(() => {
    if (hasFetched && !currentProject && projectId && !projectsLoading) {
      fetchProjects();
    }
  }, [hasFetched, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open task from notification link or Slack deep-link (?task=id)
  React.useEffect(() => {
    const { openTaskId, highlightCommentId, openNotesTab } = (location.state ?? {}) as {
      openTaskId?: string;
      highlightCommentId?: string;
      openNotesTab?: boolean;
    };
    const taskFromUrl = new URLSearchParams(location.search).get('task') ?? undefined;
    const resolvedId  = openTaskId ?? taskFromUrl;
    if (!resolvedId) return;
    const timer = setTimeout(() => {
      if (boardRef.current) {
        boardRef.current.openTaskById(resolvedId, highlightCommentId, openNotesTab);
        navigate(location.pathname, { replace: true, state: {} });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [location.state, location.search, navigate]);

  if (!hasFetched || (!currentProject && projectsLoading)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <FolderOpen size={40} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Project not found or you don&apos;t have access.</p>
        <Button variant="outline" onClick={() => navigate('/dashboard/projects')}>
          Go to Projects
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-y-2 pt-2">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="w-10 h-10 rounded-xl bg-[#FE812C]/10 flex items-center justify-center shrink-0">
            <FolderOpen size={18} className="text-[#FE812C]" />
          </div>

          {activeProjects.length > 1 ? (
            <div className="relative">
              <button
                onClick={() => { setSwitcherOpen((o) => !o); setSwitcherSearch(''); }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted transition-colors"
              >
                <span className="font-bold text-foreground text-lg leading-tight truncate min-w-0 max-w-[45vw] sm:max-w-none">
                  {projectName ?? 'Project Tasks'}
                </span>
                <ChevronDown
                  size={16}
                  className={cn('text-muted-foreground transition-transform', switcherOpen && 'rotate-180')}
                />
              </button>

              {switcherOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => { setSwitcherOpen(false); setSwitcherSearch(''); }}
                  />
                  <div className="absolute top-full mt-1 left-0 z-20 bg-card border border-border rounded-xl shadow-lg min-w-[220px] overflow-hidden">
                    <div className="p-2 border-b border-border">
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search projects..."
                          value={switcherSearch}
                          onChange={(e) => setSwitcherSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full pl-7 pr-3 py-1.5 bg-muted/50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                        />
                      </div>
                    </div>
                    <div className="max-h-[200px] overflow-y-auto py-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                      {filteredProjects.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-4 py-3 text-center">No projects found</p>
                      ) : filteredProjects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSwitcherOpen(false);
                            setSwitcherSearch('');
                            navigate(`/dashboard/projects/${p.id}/tasks`);
                          }}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-muted transition-colors',
                            p.id === projectId && 'bg-primary/5 text-primary font-medium'
                          )}
                        >
                          <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <span className="font-bold text-foreground text-xl truncate min-w-0">
              {projectName ?? 'Project Tasks'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TimerStartButton fetchParams={{ status: 'doing', projectId: projectId!, limit: 50 }} />
          {canDeleteTasks && (
            <Button
              variant="outline"
              onClick={() => setBulkDialogOpen(true)}
              className="rounded-xl gap-2"
            >
              <Layers size={16} />
              <span className="hidden sm:inline">Bulk Create</span>
            </Button>
          )}
          {canEditTasks && (
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
              className="rounded-xl gap-2"
            >
              <Sparkles size={16} className="text-[#FE812C]" />
              <span className="hidden sm:inline">Import from Notes</span>
            </Button>
          )}
          {canEditTasks && (
            <Button
              onClick={() => boardRef.current?.openCreateTask()}
              className="bg-[#FE812C] hover:bg-[#e5732a] text-white rounded-xl shadow-md shadow-[#FE812C]/20 gap-2"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Create Task</span>
            </Button>
          )}
        </div>
      </div>

      <KanbanBoard
        ref={boardRef}
        hideProjectLabel
        lockedProjectId={projectId}
        lockedProjectName={projectName}
        canEditTasks={canEditTasks}
        canDeleteTasks={canDeleteTasks}
        canAssign={canAssign}
      />

      {projectId && (
        <BulkCreateDialog
          open={bulkDialogOpen}
          onClose={() => setBulkDialogOpen(false)}
          projectId={projectId}
          onCreated={() => silentFetch()}
        />
      )}

      {projectId && (
        <ImportMarkdownDialog
          open={importDialogOpen}
          onClose={() => setImportDialogOpen(false)}
          projectId={projectId}
          onCreated={() => silentFetch()}
        />
      )}
    </div>
  );
}
