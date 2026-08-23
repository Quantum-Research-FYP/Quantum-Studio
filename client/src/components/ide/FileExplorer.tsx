import React, { useState, useRef, useEffect } from 'react';

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  content?: string;
  isOpen?: boolean;
}

export interface FileExplorerProps {
  files: FileNode[];
  activeFileId: string | null;
  onSelect: (id: string) => void;
  onCreateFile: (parentId: string | null, name: string) => void;
  onCreateFolder: (parentId: string | null, name: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onToggleFolder: (id: string) => void;
  onImportFile: (parentId: string | null, file: File) => void;
}

const PythonIcon = () => (
  <svg viewBox="0 0 128 128" width="14" height="14" style={{ flexShrink: 0 }}>
    <path
      fill="#4B8BBE"
      d="M64 6.7c-31.5 0-30.2 13.5-30.2 13.5l.1 14h30.8v4.4H33.3s-14.1-.7-14.1 13.9 14.1 14.7 14.1 14.7h9.5v-13.4s-.3-14.7 14.3-14.7h18.2s13.4.1 13.4-13.7V12.1S88.6 6.7 64 6.7zm-14.8 8.6c2.8 0 5 2.2 5 5s-2.2 5-5 5-5-2.2-5-5 2.2-5 5-5z"
    />
    <path
      fill="#FFD43B"
      d="M64 121.3c31.5 0 30.2-13.5 30.2-13.5l-.1-14H63.2v-4.4h31.4s14.1.7 14.1-13.9-14.1-14.7-14.1-14.7h-9.5v13.4s.3 14.7-14.3 14.7H52.5s-13.4-.1-13.4 13.7v13.3s.1 14.6 24.9 14.6zm14.8-8.6c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5z"
    />
  </svg>
);

const QasmIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="#10b981"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const FileIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}
  >
    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
    <polyline points="13 2 13 9 20 9"></polyline>
  </svg>
);

const FolderIcon = ({ open }: { open?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ color: 'var(--color-warning)', flexShrink: 0 }}
  >
    {open ? (
      <path d="M3 5v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
    ) : (
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    )}
  </svg>
);

const ChevronIcon = ({ open }: { open?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      transform: open ? 'rotate(90deg)' : 'none',
      transition: 'transform 0.1s',
      color: 'var(--color-text-subtle)',
      flexShrink: 0,
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

function getFileIcon(name: string) {
  if (name.endsWith('.py')) return <PythonIcon />;
  if (name.endsWith('.qasm')) return <QasmIcon />;
  return <FileIcon />;
}

export default function FileExplorer({
  files,
  activeFileId,
  onSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  onToggleFolder,
  onImportFile,
}: FileExplorerProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // New item creation state
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [creatingParentId, setCreatingParentId] = useState<string | null>(null);
  const [creatingValue, setCreatingValue] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importParentId, setImportParentId] = useState<string | null>(null);

  useEffect(() => {
    if (editingId || creatingType) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingId, creatingType]);

  const handleStartRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditValue(currentName);
  };

  const submitRename = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const handleStartCreate = (
    type: 'file' | 'folder',
    parentId: string | null,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setCreatingType(type);
    setCreatingParentId(parentId);
    setCreatingValue('');
    if (parentId) onToggleFolder(parentId); // Ensure parent is open
  };

  const submitCreate = () => {
    if (creatingType && creatingValue.trim()) {
      if (creatingType === 'file') {
        onCreateFile(creatingParentId, creatingValue.trim());
      } else {
        onCreateFolder(creatingParentId, creatingValue.trim());
      }
    }
    setCreatingType(null);
  };

  const triggerImport = (parentId: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    setImportParentId(parentId);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(importParentId, file);
    }
    e.target.value = ''; // reset
  };

  const renderNode = (node: FileNode, level: number = 0) => {
    const isFolder = node.type === 'folder';
    const isExpanded = node.isOpen;
    const isActive = activeFileId === node.id;
    const isHovered = hoverId === node.id;
    const isEditing = editingId === node.id;

    const children = files
      .filter((f) => f.parentId === node.id)
      .sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
      });

    const paddingLeft = 12 + level * 12;

    return (
      <div key={node.id}>
        <div
          onMouseEnter={() => setHoverId(node.id)}
          onMouseLeave={() => setHoverId(null)}
          onClick={() => (isFolder ? onToggleFolder(node.id) : onSelect(node.id))}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: `4px 8px 4px ${paddingLeft}px`,
            cursor: 'pointer',
            fontSize: '0.85rem',
            userSelect: 'none',
            backgroundColor: isActive
              ? 'var(--color-primary-dim)'
              : isHovered
                ? 'var(--color-surface-3)'
                : 'transparent',
            color: isActive
              ? 'var(--color-primary)'
              : isHovered
                ? 'var(--color-text)'
                : 'var(--color-text-muted)',
            borderLeft: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
            position: 'relative',
            height: '28px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
            {isFolder && (
              <div style={{ display: 'flex', alignItems: 'center', width: '12px' }}>
                <ChevronIcon open={isExpanded} />
              </div>
            )}
            {!isFolder && <div style={{ width: '12px' }} />}
            {isFolder ? <FolderIcon open={isExpanded} /> : getFileIcon(node.name)}

            {isEditing ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={submitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-primary)',
                  outline: 'none',
                  padding: '0 4px',
                  fontSize: '0.85rem',
                  marginLeft: '-4px',
                }}
              />
            ) : (
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {node.name}
              </span>
            )}
          </div>

          {/* Action buttons on hover */}
          {isHovered && !isEditing && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: isActive ? 'var(--color-primary-dim)' : 'var(--color-surface-2)',
                paddingLeft: '4px',
              }}
            >
              {isFolder && (
                <>
                  <button
                    onClick={(e) => handleStartCreate('file', node.id, e)}
                    title="New File"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="12" y1="18" x2="12" y2="12"></line>
                      <line x1="9" y1="15" x2="15" y2="15"></line>
                    </svg>
                  </button>
                  <button
                    onClick={(e) => handleStartCreate('folder', node.id, e)}
                    title="New Folder"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      <line x1="12" y1="11" x2="12" y2="17"></line>
                      <line x1="9" y1="14" x2="15" y2="14"></line>
                    </svg>
                  </button>
                </>
              )}
              <button
                onClick={(e) => handleStartRename(node.id, node.name, e)}
                title="Rename"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="16 3 21 8 8 21 3 21 3 16 16 3"></polygon>
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node.id);
                }}
                title="Delete"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-error)',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Render create input if creating inside this folder */}
        {isFolder && isExpanded && creatingParentId === node.id && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: `4px 8px 4px ${paddingLeft + 12}px`,
              height: '28px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
              <div style={{ width: '12px' }} />
              {creatingType === 'folder' ? <FolderIcon /> : <FileIcon />}
              <input
                ref={inputRef}
                value={creatingValue}
                onChange={(e) => setCreatingValue(e.target.value)}
                onBlur={submitCreate}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitCreate();
                  if (e.key === 'Escape') setCreatingType(null);
                }}
                placeholder={creatingType === 'folder' ? 'Folder name' : 'File name'}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-primary)',
                  outline: 'none',
                  padding: '0 4px',
                  fontSize: '0.85rem',
                }}
              />
            </div>
          </div>
        )}

        {/* Children */}
        {isFolder && isExpanded && children.map((child) => renderNode(child, level + 1))}
      </div>
    );
  };

  const rootNodes = files
    .filter((f) => f.parentId === null)
    .sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: '12px',
        flex: '1 1 auto',
        overflowY: 'auto',
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div
        style={{
          padding: '16px 16px 8px',
          fontSize: '0.75rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--color-text-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: 'var(--color-bg)',
          zIndex: 1,
        }}
      >
        <span>Explorer</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={(e) => handleStartCreate('file', null, e)}
            title="New File"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
          </button>
          <button
            onClick={(e) => handleStartCreate('folder', null, e)}
            title="New Folder"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              <line x1="12" y1="11" x2="12" y2="17"></line>
              <line x1="9" y1="14" x2="15" y2="14"></line>
            </svg>
          </button>
          <button
            onClick={(e) => triggerImport(null, e)}
            title="Import File"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              padding: '2px',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </button>
        </div>
      </div>

      {/* Root level create input */}
      {creatingParentId === null && creatingType && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px 4px 12px',
            height: '28px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
            <div style={{ width: '12px' }} />
            {creatingType === 'folder' ? <FolderIcon /> : <FileIcon />}
            <input
              ref={inputRef}
              value={creatingValue}
              onChange={(e) => setCreatingValue(e.target.value)}
              onBlur={submitCreate}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreate();
                if (e.key === 'Escape') setCreatingType(null);
              }}
              placeholder={creatingType === 'folder' ? 'Folder name' : 'File name'}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-primary)',
                outline: 'none',
                padding: '0 4px',
                fontSize: '0.85rem',
              }}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {rootNodes.map((node) => renderNode(node))}
        {rootNodes.length === 0 && !creatingType && (
          <div
            style={{
              padding: '16px',
              color: 'var(--color-text-muted)',
              fontSize: '0.8rem',
              fontStyle: 'italic',
              textAlign: 'center',
            }}
          >
            No files. Create or import one.
          </div>
        )}
      </div>
    </div>
  );
}
