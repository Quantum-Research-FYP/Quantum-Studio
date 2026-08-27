import re

with open("client/src/pages/IdePage.tsx", "r") as f:
    content = f.read()

# Replace FileExplorer component and FileItem
file_explorer_pattern = re.compile(r"function FileItem\(.*?}\n\n/\* ------------------------------------------------------------------ \*/", re.DOTALL)

new_components = """
function FileItem({
  name,
  active,
  onClick,
  onDelete,
  icon,
}: {
  name: string;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
  icon: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px 6px 36px',
        cursor: 'pointer',
        fontSize: '0.85rem',
        userSelect: 'none',
        backgroundColor: active ? 'var(--color-primary-dim)' : hover ? 'var(--color-surface-3)' : 'transparent',
        color: active ? 'var(--color-text)' : hover ? 'var(--color-text)' : 'var(--color-text-muted)',
        borderLeft: active ? '2px solid var(--color-primary)' : '2px solid transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {icon}
        <span>{name}</span>
      </div>
      {onDelete && hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '0 4px', fontSize: '1.1rem', lineHeight: '1', borderRadius: '4px' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
        >
          ×
        </button>
      )}
    </div>
  );
}

function FolderItem({
  name,
  active,
  isRenaming,
  onSelect,
  onRename,
  onDelete,
  children
}: {
  name: string;
  active: boolean;
  isRenaming: boolean;
  onSelect: () => void;
  onRename: (newName: string) => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const [renameVal, setRenameVal] = useState(name);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={onSelect}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 16px 6px 16px',
          cursor: 'pointer',
          fontSize: '0.85rem',
          userSelect: 'none',
          backgroundColor: active ? 'var(--color-primary-dim)' : hover ? 'var(--color-surface-3)' : 'transparent',
          color: active ? 'var(--color-text)' : hover ? 'var(--color-text)' : 'var(--color-text-muted)',
          borderLeft: active ? '2px solid var(--color-primary)' : '2px solid transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FolderIcon open={true} />
          {isRenaming ? (
            <input
              autoFocus
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onBlur={() => onRename(renameVal)}
              onKeyDown={(e) => { if (e.key === 'Enter') onRename(renameVal); if (e.key === 'Escape') onRename(name); }}
              onClick={(e) => e.stopPropagation()}
              style={{ background: 'var(--color-surface-1)', color: 'var(--color-text)', border: '1px solid var(--color-primary)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.85rem', outline: 'none', width: '120px' }}
            />
          ) : (
            <span>{name}</span>
          )}
        </div>
        {hover && !isRenaming && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '0 4px', fontSize: '1.1rem', lineHeight: '1' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-error)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
          >
            ×
          </button>
        )}
      </div>
      {children && <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>}
    </div>
  );
}

function FileExplorer({
  activeFile,
  files,
  folders,
  selectedFolder,
  renamingFolder,
  onSelectFile,
  onSelectFolder,
  onAddFile,
  onAddFolder,
  onRenameFolder,
  onDeleteFile,
  onDeleteFolder,
}: {
  activeFile: string;
  files: Record<string, string>;
  folders: string[];
  selectedFolder: string;
  renamingFolder: string | null;
  onSelectFile: (f: string) => void;
  onSelectFolder: (f: string) => void;
  onAddFile: (fwId: string, template: string) => void;
  onAddFolder: () => void;
  onRenameFolder: (oldPath: string, newPath: string) => void;
  onDeleteFile: (f: string) => void;
  onDeleteFolder: (f: string) => void;
}) {
  const [srcOpen, setSrcOpen] = useState(true);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const rootFiles = Object.keys(files).filter(f => !f.includes('/'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: '12px', borderBottom: '1px solid var(--color-border)' }}>
      <div style={{ padding: '16px 16px 12px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Explorer</span>
        <div style={{ display: 'flex', gap: '4px', position: 'relative' }}>
          <button
            onClick={() => setAddMenuOpen(!addMenuOpen)}
            title="New File"
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', padding: 0 }}
          >
            +📄
          </button>
          <button
            onClick={onAddFolder}
            title="New Folder"
            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', padding: 0 }}
          >
            +📁
          </button>
          
          {addMenuOpen && (
            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 10, minWidth: '150px', overflow: 'hidden' }}>
              {FRAMEWORKS.map((fw) => (
                <div
                  key={fw.id}
                  onClick={() => { onAddFile(fw.id, fw.template); setAddMenuOpen(false); }}
                  style={{ padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span style={{ width: '12px', display: 'inline-block' }}></span>
                  {fw.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        onClick={() => { setSrcOpen(!srcOpen); onSelectFolder(''); }}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 16px', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '0.85rem', userSelect: 'none', backgroundColor: selectedFolder === '' ? 'var(--color-surface-3)' : 'transparent' }}
      >
        <ChevronIcon open={srcOpen} />
        <FolderIcon open={srcOpen} />
        <span style={{ fontWeight: 500, letterSpacing: '0.02em' }}>Quantum-Project</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '2px', overflow: 'hidden', height: srcOpen ? 'auto' : 0 }}>
        {folders.map(folder => (
          <FolderItem
            key={folder}
            name={folder}
            active={selectedFolder === folder}
            isRenaming={renamingFolder === folder}
            onSelect={() => onSelectFolder(folder)}
            onRename={(newName) => onRenameFolder(folder, newName)}
            onDelete={() => onDeleteFolder(folder)}
          >
            {Object.keys(files).filter(f => f.startsWith(folder + '/') && f.substring(folder.length + 1).indexOf('/') === -1).map(filename => (
              <FileItem
                key={filename}
                name={filename.substring(folder.length + 1)}
                active={activeFile === filename}
                onClick={() => onSelectFile(filename)}
                onDelete={() => onDeleteFile(filename)}
                icon={filename.endsWith('.qasm') ? <QasmIcon /> : <PythonIcon />}
              />
            ))}
          </FolderItem>
        ))}
        {rootFiles.map((filename) => (
          <FileItem
            key={filename}
            name={filename}
            active={activeFile === filename}
            onClick={() => onSelectFile(filename)}
            onDelete={() => onDeleteFile(filename)}
            icon={filename.endsWith('.qasm') ? <QasmIcon /> : <PythonIcon />}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */"""

content = file_explorer_pattern.sub(new_components, content)

# Now inject the new state and handlers into IdePage
ide_state_pattern = re.compile(r"const defaultFw = FRAMEWORKS\.find.*?const \[files, setFiles\] = useState<Record<string, string>>\(\{.*?\}\);", re.DOTALL)

new_state = """const defaultFw = FRAMEWORKS.find(f => f.id === 'qiskit')!;
  const [activeFile, setActiveFile] = useState<string>(defaultFw.file);
  const [files, setFiles] = useState<Record<string, string>>({
    [defaultFw.file]: defaultFw.template,
  });
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);"""

content = ide_state_pattern.sub(new_state, content)

# Inject the new handlers
handlers_pattern = re.compile(r"const handleFileChange = \(file: string\) => \{.*?const handleCodeChange = \(newCode: string \| undefined\) => \{", re.DOTALL)

new_handlers = """const handleFileChange = (file: string) => {
    setActiveFile(file);
    setEditorError(null);
  };

  const handleSelectFolder = (folder: string) => {
    setSelectedFolder(folder);
  };

  const handleAddFolder = () => {
    let newFolderName = 'New Folder';
    let i = 1;
    while (folders.includes(newFolderName)) {
      newFolderName = `New Folder ${i}`;
      i++;
    }
    setFolders(prev => [...prev, newFolderName]);
    setRenamingFolder(newFolderName);
    setSelectedFolder(newFolderName);
  };

  const handleRenameFolder = (oldPath: string, newPath: string) => {
    if (!newPath || newPath === oldPath || folders.includes(newPath)) {
      setRenamingFolder(null);
      return;
    }
    setFolders(prev => prev.map(f => f === oldPath ? newPath : f));
    setFiles(prev => {
      const next = { ...prev };
      for (const [key, val] of Object.entries(next)) {
        if (key.startsWith(oldPath + '/')) {
          next[newPath + '/' + key.substring(oldPath.length + 1)] = val;
          delete next[key];
        }
      }
      return next;
    });
    if (selectedFolder === oldPath) {
      setSelectedFolder(newPath);
    }
    if (activeFile.startsWith(oldPath + '/')) {
      setActiveFile(newPath + '/' + activeFile.substring(oldPath.length + 1));
    }
    setRenamingFolder(null);
  };

  const handleDeleteFolder = (folderPath: string) => {
    setFolders(prev => prev.filter(f => f !== folderPath));
    setFiles(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.startsWith(folderPath + '/')) {
          delete next[key];
        }
      }
      return next;
    });
    if (selectedFolder === folderPath) {
      setSelectedFolder('');
    }
    if (activeFile.startsWith(folderPath + '/')) {
      setActiveFile('');
    }
  };

  const handleAddFile = (fwId: string, template: string) => {
    const fw = FRAMEWORKS.find(f => f.id === fwId);
    if (!fw) return;
    const ext = fw.file.includes('.') ? fw.file.substring(fw.file.lastIndexOf('.')) : '';
    const baseName = fw.file.includes('.') ? fw.file.substring(0, fw.file.lastIndexOf('.')) : fw.file;

    let newName = selectedFolder ? `${selectedFolder}/${fw.file}` : fw.file;
    let i = 1;
    while (files[newName] !== undefined) {
      newName = selectedFolder ? `${selectedFolder}/${baseName}_${i}${ext}` : `${baseName}_${i}${ext}`;
      i++;
    }
    
    setFiles(prev => ({ ...prev, [newName]: template }));
    setActiveFile(newName);
    setEditorError(null);
  };

  const handleDeleteFile = (file: string) => {
    setFiles((prev) => {
      const newFiles = { ...prev };
      delete newFiles[file];
      if (activeFile === file) {
        const remaining = Object.keys(newFiles);
        if (remaining.length > 0) {
          setActiveFile(remaining[0]);
        } else {
          setActiveFile('');
        }
      }
      return newFiles;
    });
  };

  const handleCodeChange = (newCode: string | undefined) => {"""

content = handlers_pattern.sub(new_handlers, content)

# Finally, update the FileExplorer instantiation in IdePage return block
explorer_instance_pattern = re.compile(r"<FileExplorer activeFile=\{activeFile\}.*?/>")
new_explorer_instance = """<FileExplorer
          activeFile={activeFile}
          files={files}
          folders={folders}
          selectedFolder={selectedFolder}
          renamingFolder={renamingFolder}
          onSelectFile={handleFileChange}
          onSelectFolder={handleSelectFolder}
          onAddFile={handleAddFile}
          onAddFolder={handleAddFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFile={handleDeleteFile}
          onDeleteFolder={handleDeleteFolder}
        />"""

content = explorer_instance_pattern.sub(new_explorer_instance, content)


with open("client/src/pages/IdePage.tsx", "w") as f:
    f.write(content)
