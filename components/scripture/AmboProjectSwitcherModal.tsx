// AmboProjectSwitcherModal.tsx — Workspace & Project Management for Ambo Pro.
// Switch between Personal account projects and enrolled Organization projects on Plajah.

import React, { useState, useEffect } from 'react';
import {
  X, Folder, Plus, Upload, Download, Copy, Trash2, Check,
  Building2, User, Clock, Layers, Sparkles, AlertCircle, RefreshCw, FileArchive
} from 'lucide-react';
import {
  type AmboProject,
  type AmboProjectSummary,
  type ProjectScope,
  createDefaultProject,
} from '../../services/ambo/amboProjectModel';
import {
  listProjects,
  loadProject,
  saveProject,
  deleteProject,
  duplicateProject,
  setActiveProjectId,
} from '../../services/ambo/amboStorageService';
import { exportProjectJson, exportProjectBundle, downloadFile } from '../../services/ambo/amboBundleService';
import { auth } from '../../services/backendService';
import { fetchUserOrganizations } from '../../services/organizationService';
import { type Organization } from '../../types';

interface AmboProjectSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProject: AmboProject;
  onSelectProject: (project: AmboProject) => void;
  onOpenImportModal: () => void;
}

export const AmboProjectSwitcherModal: React.FC<AmboProjectSwitcherModalProps> = ({
  isOpen,
  onClose,
  activeProject,
  onSelectProject,
  onOpenImportModal,
}) => {
  const [activeScope, setActiveScope] = useState<ProjectScope>(activeProject.scope || 'USER');
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(activeProject.organizationId);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<AmboProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);

  // Load organizations enrolled by the current user
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (uid) {
      fetchUserOrganizations(uid)
        .then(orgs => setOrganizations(orgs || []))
        .catch(() => setOrganizations([]));
    }
  }, []);

  // Load projects for active scope
  const refreshProjects = async () => {
    setIsLoading(true);
    try {
      const list = await listProjects(activeScope, selectedOrgId);
      setProjects(list);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshProjects();
    }
  }, [isOpen, activeScope, selectedOrgId]);

  if (!isOpen) return null;

  const handleSelectWorkspace = (scope: ProjectScope, org?: Organization) => {
    setActiveScope(scope);
    setSelectedOrgId(org?.id);
  };

  const handleOpenProject = async (projectId: string) => {
    if (projectId === activeProject.id) {
      onClose();
      return;
    }
    setIsLoading(true);
    const prj = await loadProject(projectId);
    setIsLoading(false);
    if (prj) {
      setActiveProjectId(prj.id);
      onSelectProject(prj);
      onClose();
    }
  };

  const handleCreateNewProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const currentOrg = organizations.find(o => o.id === selectedOrgId);
    const newPrj = createDefaultProject(
      newProjectName.trim(),
      activeScope,
      auth.currentUser?.uid || 'local-user',
      selectedOrgId,
      currentOrg?.name
    );

    await saveProject(newPrj);
    setNewProjectName('');
    setIsCreatingNew(false);
    await refreshProjects();
    onSelectProject(newPrj);
    onClose();
  };

  const handleDuplicate = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await duplicateProject(projectId);
    await refreshProjects();
  };

  const handleDelete = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project?')) {
      await deleteProject(projectId, activeScope, selectedOrgId);
      await refreshProjects();
    }
  };

  const handleExportJson = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const prj = await loadProject(projectId);
    if (!prj) return;
    const blob = exportProjectJson(prj);
    downloadFile(blob, `${prj.name.replace(/\s+/g, '_')}.amboprj`);
  };

  const handleExportBundle = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportingId(projectId);
    try {
      const prj = await loadProject(projectId);
      if (!prj) return;
      const blob = await exportProjectBundle(prj);
      downloadFile(blob, `${prj.name.replace(/\s+/g, '_')}.amboz`);
    } catch (err) {
      alert('Error creating asset bundle: ' + String(err));
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl bg-[#140e21] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40 flex-none">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6B0099] to-[#D40055] flex items-center justify-center text-white font-extrabold text-sm">
              <Folder size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Ambo Project Workspaces</h2>
              <p className="text-xs text-white/50">Manage personal services and enrolled organization presentations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        {/* Workspace Context Selector Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 pb-2 border-b border-white/10 bg-black/20 overflow-x-auto flex-none">
          <button
            onClick={() => handleSelectWorkspace('USER')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeScope === 'USER'
                ? 'bg-white/15 text-white border border-white/20 shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <User size={13} className="text-[#00DAF3]" />
            <span>Personal Workspace</span>
          </button>

          {organizations.map(org => {
            const isSelected = activeScope === 'ORGANIZATION' && selectedOrgId === org.id;
            return (
              <button
                key={org.id}
                onClick={() => handleSelectWorkspace('ORGANIZATION', org)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-white/15 text-white border border-white/20 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Building2 size={13} className="text-[#E3C57E]" />
                <span>{org.name}</span>
              </button>
            );
          })}
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-black/10 flex-none">
          <div className="text-xs text-white/50 font-medium">
            {projects.length} {projects.length === 1 ? 'project' : 'projects'} in this workspace
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenImportModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all"
            >
              <Upload size={13} className="text-[#00DAF3]" />
              <span>Import Presentation</span>
            </button>
            <button
              onClick={() => setIsCreatingNew(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-white shadow-md hover:opacity-90 transition-all"
            >
              <Plus size={13} />
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* New Project Prompt Bar */}
        {isCreatingNew && (
          <form onSubmit={handleCreateNewProject} className="p-4 bg-black/60 border-b border-white/10 flex items-center gap-3 flex-none animate-in slide-in-from-top-2">
            <input
              type="text"
              placeholder="Enter new presentation / service title..."
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              autoFocus
              className="flex-1 bg-white/5 border border-white/20 rounded-lg px-3.5 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:border-[#00DAF3]"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-bold bg-[#00DAF3] hover:bg-[#20e1f7] text-[#04222a] transition-colors"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingNew(false)}
              className="px-3 py-2 rounded-lg text-xs text-white/50 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </form>
        )}

        {/* Project Grid */}
        <div className="p-6 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-white/40 gap-2">
              <RefreshCw size={24} className="animate-spin text-[#00DAF3]" />
              <span className="text-xs">Loading projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/40 gap-3">
              <Folder size={36} className="text-white/20" />
              <div className="text-sm font-semibold text-white/80">No projects yet in this workspace</div>
              <p className="text-xs text-white/40 max-w-xs text-center">
                Create a new project or import existing PowerPoint, PDF, or FreeShow presentations.
              </p>
              <button
                onClick={() => setIsCreatingNew(true)}
                className="mt-1 px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-all"
              >
                Create First Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(prj => {
                const isActive = prj.id === activeProject.id;
                const isExporting = exportingId === prj.id;
                return (
                  <div
                    key={prj.id}
                    onClick={() => handleOpenProject(prj.id)}
                    className={`group relative rounded-xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
                      isActive
                        ? 'border-[#00DAF3] bg-[#00DAF3]/10 shadow-[0_0_18px_rgba(0,218,243,0.15)] ring-1 ring-[#00DAF3]/40'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#00DAF3] animate-pulse' : 'bg-white/20'}`} />
                          <h3 className="text-sm font-bold text-white truncate max-w-[200px]" title={prj.name}>
                            {prj.name}
                          </h3>
                        </div>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-[#00DAF3]/20 text-[#00DAF3]">
                            Active
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-white/45 mb-4">
                        <span className="flex items-center gap-1">
                          <Layers size={12} /> {prj.showCount} {prj.showCount === 1 ? 'show' : 'shows'} ({prj.slideCount} slides)
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> {new Date(prj.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Actions Bar */}
                    <div className="pt-3 border-t border-white/5 flex items-center justify-between text-white/40">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={e => handleExportJson(prj.id, e)}
                          className="p-1.5 rounded hover:bg-white/10 hover:text-white transition-colors"
                          title="Export .amboprj (JSON project file)"
                        >
                          <Download size={13} />
                        </button>
                        <button
                          disabled={isExporting}
                          onClick={e => handleExportBundle(prj.id, e)}
                          className="p-1.5 rounded hover:bg-white/10 hover:text-[#00DAF3] transition-colors"
                          title="Export .amboz (Asset Bundle with all media)"
                        >
                          <FileArchive size={13} className={isExporting ? 'animate-spin text-[#00DAF3]' : ''} />
                        </button>
                        <button
                          onClick={e => handleDuplicate(prj.id, e)}
                          className="p-1.5 rounded hover:bg-white/10 hover:text-white transition-colors"
                          title="Duplicate Project"
                        >
                          <Copy size={13} />
                        </button>
                      </div>

                      <button
                        onClick={e => handleDelete(prj.id, e)}
                        className="p-1.5 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors"
                        title="Delete Project"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
