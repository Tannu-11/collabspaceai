import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { io } from 'socket.io-client';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import TaskCard from '../components/TaskCard';
import CreateTaskModal from '../components/CreateTaskModal';
import ChatBox from '../components/ChatBox';
import ActivityFeed from '../components/ActivityFeed';
import AIAssistant from '../components/AIAssistant';
import toast from 'react-hot-toast';

const COLS = [
  { id:'todo',       label:'To Do',       color:'#6b7280', dim:'rgba(107,114,128,0.08)'  },
  { id:'inprogress', label:'In Progress', color:'#fbbf24', dim:'rgba(251,191,36,0.08)'   },
  { id:'done',       label:'Done',        color:'#34d399', dim:'rgba(52,211,153,0.08)'   },
];

export default function ProjectBoard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject]     = useState(null);
  const [tasks, setTasks]         = useState([]);
  const [modal, setModal]         = useState(false);
  const [editTask, setEditTask]   = useState(null);
  const [addMem, setAddMem]       = useState(false);
  const [memEmail, setMemEmail]   = useState('');
  const [panel, setPanel]         = useState(null); // 'chat' | 'activity' | 'ai' | null
  const [loading, setLoading]     = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [summary, setSummary]     = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const [aiExpanded, setAiExpanded]     = useState(false);
  const [showAI, setShowAI]             = useState(false);
  const [taskTab, setTaskTab]           = useState('all');
  const [files, setFiles]               = useState([]);
  const [isDragging, setIsDragging]     = useState(false);
  const aiRef = useRef(null);

  // Close AI dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => { if (aiRef.current && !aiRef.current.contains(e.target)) setAiExpanded(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [pr, tr, fr] = await Promise.all([
          API.get('/projects'), 
          API.get(`/tasks/${id}`),
          API.get(`/files/${id}`).catch(() => ({ data: [] }))
        ]);
        const found = pr.data.find(p => p._id === id);
        if (!found) { navigate('/'); return; }
        setProject(found);
        setTasks(tr.data);
        setFiles(fr.data);
      } catch { toast.error('Failed to load project'); }
      finally { setLoading(false); }
    };
    load();
  }, [id, navigate]);

  // Real-time task updates
  useEffect(() => {
    const socket = io('http://localhost:5000', {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('joinRoom', id);
    });

    socket.on('taskCreated', task => {
      setTasks(prev => {
        if (prev.some(t => t._id === task._id)) return prev;
        return [...prev, task];
      });
    });

    socket.on('taskUpdated', updated => {
      setTasks(prev => prev.map(t => t._id === updated._id ? updated : t));
    });

    socket.on('taskDeleted', taskId => {
      setTasks(prev => prev.filter(t => t._id !== taskId));
    });

    socket.on('tasksBulkCreated', newTasks => {
      setTasks(prev => {
        const existingIds = new Set(prev.map(t => t._id));
        const added = newTasks.filter(t => !existingIds.has(t._id));
        return [...prev, ...added];
      });
    });

    socket.on('fileUploaded', file => {
      setFiles(prev => {
        if (prev.some(f => f._id === file._id)) return prev;
        return [file, ...prev];
      });
    });

    socket.on('fileDeleted', fileId => {
      setFiles(prev => prev.filter(f => f._id !== fileId));
    });

    return () => {
      socket.disconnect();
    };
  }, [id]);

  const onDragEnd = async ({ draggableId, destination }) => {
    if (!destination) return;
    setTasks(p => p.map(t => t._id === draggableId ? {...t, status: destination.droppableId} : t));
    await API.put(`/tasks/${draggableId}`, { status: destination.droppableId });
    toast.success(`Task moved to ${destination.droppableId}`, { duration: 1500 });
  };

  const addMember = async (e) => {
    e.preventDefault();
    try {
      const { data } = await API.post(`/projects/${id}/add-member`, { email: memEmail });
      setProject(data); setMemEmail(''); setAddMem(false);
      toast.success('Member added!');
    } catch (err) { toast.error(err.response?.data?.message || 'User not found'); }
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = async (e) => {
    e.preventDefault(); setIsDragging(false);
    const uploadedFiles = e.dataTransfer.files;
    if (!uploadedFiles.length) return;
    
    for (let i = 0; i < uploadedFiles.length; i++) {
      const formData = new FormData();
      formData.append('file', uploadedFiles[i]);
      try {
        const { data } = await API.post(`/files/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setFiles(prev => [data, ...prev]);
        toast.success(`Uploaded ${uploadedFiles[i].name}`);
      } catch (err) { toast.error(`Failed to upload ${uploadedFiles[i].name}`); }
    }
  };

  const deleteFile = async (fid) => {
    if (!confirm('Delete file?')) return;
    try {
      await API.delete(`/files/${fid}`);
      setFiles(prev => prev.filter(f => f._id !== fid));
      toast.success('Deleted');
    } catch { toast.error('Failed to delete'); }
  };

  // AI Task Generator
  const handleAIGenerate = async () => {
    setAiGenLoading(true);
    toast('🤖 AI is generating tasks...', { duration: 3000 });
    try {
      const { data } = await API.post('/ai/generate-tasks', {
        projectName: project.name,
        projectDescription: project.description || project.name,
      });
      const bulk = await API.post('/tasks/bulk', { tasks: data.tasks, projectId: id });
      setTasks(prev => [...prev, ...bulk.data]);
      toast.success(`✨ AI generated ${bulk.data.length} tasks!`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'AI generation failed');
    }
    setAiGenLoading(false);
  };

  // AI Progress Summarizer
  const handleSummarize = async () => {
    setAiLoading(true);
    setSummary('');
    setShowSummary(true);
    try {
      const { data } = await API.post('/ai/summarize', {
        projectName: project.name,
        tasks,
        memberCount: project.members.length,
      });
      setSummary(data.summary);
    } catch (err) {
      toast.error('Summary failed');
      setShowSummary(false);
    }
    setAiLoading(false);
  };

  const colTasks = cid => tasks.filter(t => {
    if (t.status !== cid) return false;
    
    // "Assigned" tab filter
    if (taskTab === 'assigned') {
      const aid = t.assignedTo?._id || t.assignedTo;
      if (!aid || aid.toString() !== user.id.toString()) return false;
    }

    // Role-based filter: If not leader and NOT on 'all' tab, only show their own tasks!
    if (!isLeader && taskTab !== 'all') {
      const aid = t.assignedTo?._id || t.assignedTo;
      if (!aid || aid.toString() !== user.id.toString()) return false;
    }

    return true;
  });
  const done     = tasks.filter(t => t.status === 'done').length;
  const pct      = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const isLeader = project?.myRole === 'leader';

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Navbar />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 52px)' }}>
        <span className="spinner" style={{ width: '28px', height: '28px', borderWidth: '2px', color: 'var(--blue)' }} />
        <p style={{ color: 'var(--text3)', marginTop: '12px', fontSize: '13px' }}>Loading project...</p>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      <Navbar />

      {/* AI Summary Modal */}
      {showSummary && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSummary(false)}>
          <div className="modal-box modal-box-lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <div className="badge badge-ai" style={{ marginBottom: '8px' }}>✦ AI Progress Report</div>
                <h3 style={{ fontSize: '20px', fontWeight: '700' }}>{project.name}</h3>
              </div>
              <button onClick={() => setShowSummary(false)} className="btn btn-ghost btn-sm"
                style={{ border: '1px solid var(--border2)' }}>✕</button>
            </div>
            {aiLoading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <div className="spinner" style={{ width: '28px', height: '28px', color: 'var(--ai)', margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--text2)', fontSize: '13px' }}>AI is analyzing your project...</p>
              </div>
            ) : (
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--ai-border)', borderRadius: 'var(--radius-lg)', padding: '20px' }}>
                <p style={{ fontSize: '13px', lineHeight: '1.8', color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{summary}</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(summary); toast.success('Copied!'); }}>Copy Report</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowSummary(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div style={s.wrap}>
        {/* Header */}
        <div style={s.header} className="fade-up">
          <div style={s.hl}>
            <div style={s.badge}>{project?.name?.[0]?.toUpperCase()}</div>
            <div>
              <h1 style={s.title}>{project?.name}</h1>
              {project?.description && <p style={s.desc}>{project.description}</p>}
            </div>
          </div>
          <div style={s.hr}>
            {/* Progress */}
            <div style={s.progress}>
              <div style={s.progressBar}>
                <div style={{ ...s.progressFill, width: `${pct}%` }} />
              </div>
              <span style={s.progressTxt}>{pct}%</span>
            </div>

            {/* Members */}
            <div style={s.mems}>
              {project?.members?.slice(0,4).map((m,i) => (
                <div key={m._id} title={m.name}
                  style={{ ...s.memAv, marginLeft: i>0?'-8px':'0', zIndex: 10-i }}>
                  {m.name[0].toUpperCase()}
                </div>
              ))}
              {isLeader && (
                <button className="btn btn-ghost btn-sm" style={{ border: '1px solid var(--border2)', marginLeft: '8px' }}
                  onClick={() => setAddMem(!addMem)}>+ Member</button>
              )}
            </div>

            {/* Role badge */}
            <span style={{
              fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '99px',
              background: isLeader ? 'rgba(37,99,235,0.1)' : 'rgba(124,58,237,0.1)',
              color: isLeader ? 'var(--blue)' : 'var(--purple)',
              border: `1px solid ${isLeader ? 'rgba(37,99,235,0.25)' : 'rgba(124,58,237,0.25)'}`,
            }}>
              {isLeader ? '👑 Leader' : '👤 Member'}
            </span>

            <button className="btn btn-secondary btn-sm" onClick={() => setPanel(panel==='upload'?null:'upload')}
              style={{ borderColor: panel==='upload' ? 'var(--blue)' : undefined }}>
              📁 Upload
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setPanel(panel==='chat'?null:'chat')}
              style={{ borderColor: panel==='chat' ? 'var(--blue)' : undefined }}>
              💬 Chat
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setPanel(panel==='activity'?null:'activity')}
              style={{ borderColor: panel==='activity' ? 'var(--green)' : undefined }}>
              📋 Activity
            </button>

            {/* Collapsible AI Tools — leader only */}
            {isLeader && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className="btn btn-sm"
                  style={{
                    background: aiExpanded ? 'var(--ai-dim)' : 'var(--bg3)',
                    color: aiExpanded ? 'var(--ai)' : 'var(--text2)',
                    border: aiExpanded ? '1px solid var(--ai-border)' : '1px solid var(--border2)',
                    display: 'flex', alignItems: 'center', gap: '5px',
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setAiExpanded(v => !v)}
                >
                  ✦ AI Tools
                  <span style={{
                    display: 'inline-block',
                    transform: aiExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    fontSize: '10px',
                  }}>▾</span>
                </button>

                {aiExpanded && (
                  <>
                    <button className="btn btn-ai btn-sm"
                      onClick={() => { handleAIGenerate(); setAiExpanded(false); }}
                      disabled={aiGenLoading}>
                      {aiGenLoading
                        ? <><span className="spinner" style={{ color: 'white' }} /> Generating...</>
                        : '🤖 Generate Tasks with AI'}
                    </button>
                    <button className="btn btn-sm"
                      style={{ background: 'var(--ai-dim)', color: 'var(--ai)', border: '1px solid var(--ai-border)' }}
                      onClick={() => { handleSummarize(); setAiExpanded(false); }}
                      disabled={aiLoading}>
                      {aiLoading
                        ? <><span className="spinner" style={{ color: 'var(--ai)' }} /> Analyzing...</>
                        : '📊 AI Progress Report'}
                    </button>
                  </>
                )}
              </div>
            )}

            {isLeader && (
              <button className="btn btn-primary" onClick={() => setModal(true)}>+ Task</button>
            )}
          </div>
        </div>

        {/* tasks complete count */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }} className="fade-up d1">
          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
            {done}/{tasks.length} tasks complete
          </span>
        </div>

        {/* Add Member */}
        {addMem && (
          <div style={s.memBox} className="scale-in">
            <form onSubmit={addMember} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <label className="label">Add team member by email</label>
                <input type="email" placeholder="teammate@example.com"
                  value={memEmail} onChange={e => setMemEmail(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary" style={{ padding: '9px 20px' }}>Add Member</button>
              <button type="button" className="btn btn-ghost" style={{ border: '1px solid var(--border2)' }}
                onClick={() => setAddMem(false)}>Cancel</button>
            </form>
          </div>
        )}

        {/* Task filter tab bar */}
        {(() => {
          const TASK_TABS = [
            { id: 'all',        label: 'All Tasks',      color: '#6366f1', dim: 'rgba(99,102,241,0.1)'  },
            { id: 'assigned',   label: 'Assigned',       color: '#ec4899', dim: 'rgba(236,72,153,0.1)'  },
            { id: 'todo',       label: 'To Do',          color: '#6b7280', dim: 'rgba(107,114,128,0.1)' },
            { id: 'inprogress', label: 'In Progress',    color: '#fbbf24', dim: 'rgba(251,191,36,0.1)'  },
            { id: 'done',       label: 'Done',           color: '#34d399', dim: 'rgba(52,211,153,0.1)'  },
          ];
          const counts = { 
            all: tasks.length, 
            assigned: tasks.filter(t => (t.assignedTo?._id || t.assignedTo) === user.id).length,
            todo: tasks.filter(t=> {
              if (!isLeader) {
                const aid = t.assignedTo?._id || t.assignedTo;
                if (aid !== user.id) return false;
              }
              return t.status === 'todo';
            }).length, 
            inprogress: tasks.filter(t=> {
              if (!isLeader) {
                const aid = t.assignedTo?._id || t.assignedTo;
                if (aid !== user.id) return false;
              }
              return t.status === 'inprogress';
            }).length, 
            done: tasks.filter(t=> {
              if (!isLeader) {
                const aid = t.assignedTo?._id || t.assignedTo;
                if (aid !== user.id) return false;
              }
              return t.status === 'done';
            }).length 
          };
          return (
            <div style={s.taskSection} className="fade-up d1">
              <div style={s.taskTabBar}>
                {TASK_TABS.map(tt => (
                  <button key={tt.id} onClick={() => setTaskTab(tt.id)} style={{
                    ...s.taskTabBtn,
                    background: taskTab === tt.id ? tt.dim : 'transparent',
                    color: taskTab === tt.id ? tt.color : 'var(--text3)',
                    border: taskTab === tt.id ? `1px solid ${tt.color}30` : '1px solid transparent',
                    fontWeight: taskTab === tt.id ? '700' : '500',
                  }}>
                    {tt.label}
                    <span style={{
                      marginLeft: '5px', fontSize: '10px', fontWeight: '700',
                      background: taskTab === tt.id ? tt.color + '20' : 'var(--bg4)',
                      color: taskTab === tt.id ? tt.color : 'var(--text3)',
                      borderRadius: '99px', padding: '1px 6px',
                    }}>{counts[tt.id]}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Main: Board + Panel */}
        <div style={{ display: 'grid', gridTemplateColumns: panel ? '1fr 340px' : '1fr', gap: '16px', alignItems: 'start' }}>
          
          {/* Kanban */}
          <DragDropContext onDragEnd={onDragEnd}>
              <div style={{
                ...s.board,
                gridTemplateColumns: (taskTab === 'all' || taskTab === 'assigned') ? 'repeat(3,1fr)' : '1fr',
              }}>
                {COLS.filter(col => taskTab === 'all' || taskTab === 'assigned' || col.id === taskTab).map((col, ci) => (
                  <div key={col.id} style={s.col} className={`fade-up d${ci+2}`}>
                    <div style={s.colHead}>
                      <div style={s.colLeft}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.color, boxShadow: `0 0 6px ${col.color}` }} />
                        <span style={s.colLabel}>{col.label}</span>
                      </div>
                      <span style={{ ...s.colBadge, background: col.dim, color: col.color }}>
                        {colTasks(col.id).length}
                      </span>
                    </div>
                    <Droppable droppableId={col.id}>
                      {(prov, snap) => (
                        <div ref={prov.innerRef} {...prov.droppableProps}
                          style={{ ...s.drop, background: snap.isDraggingOver ? col.dim : 'transparent', borderColor: snap.isDraggingOver ? col.color + '30' : 'transparent' }}>
                          {colTasks(col.id).map((task, idx) => {
                            const isMine = (task.assignedTo?._id || task.assignedTo) === user.id;
                            const canDrag = isLeader || isMine;
                            return (
                              <Draggable key={task._id} draggableId={task._id} index={idx} isDragDisabled={!canDrag}>
                                {(prov2, snap2) => (
                                <div ref={prov2.innerRef} {...prov2.draggableProps} {...prov2.dragHandleProps}
                                  style={{ ...prov2.draggableProps.style, opacity: snap2.isDragging ? 0.8 : 1 }}>
                                  <TaskCard task={task} isLeader={isLeader}
                                    onEdit={t => setEditTask(t)}
                                    onDelete={did => setTasks(p => p.filter(t => t._id !== did))} />
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {prov.placeholder}
                          {colTasks(col.id).length === 0 && !snap.isDraggingOver && (
                            <div style={s.emptyCol}>
                              <p style={{ color: 'var(--text3)', fontSize: '12px' }}>No tasks</p>
                            </div>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </div>
                ))}
              </div>
            </DragDropContext>

          {/* Side Panel */}
          {panel === 'upload' && (
            <div style={s.sidePanel} className="fade-up">
              <div 
                onDragOver={handleDragOver} 
                onDragLeave={handleDragLeave} 
                onDrop={handleDrop}
                style={{
                  ...s.filesZone,
                  borderColor: isDragging ? 'var(--blue)' : 'var(--border)',
                  background: isDragging ? 'var(--blue-dim)' : 'var(--bg2)',
                  minHeight: '100%',
                  display: 'flex', flexDirection: 'column'
                }}
              >
                <div style={{ textAlign: 'center', padding: '20px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }}>📁</span>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)', marginBottom: '4px' }}>Project Files</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Drag & drop any file here (JPG, PDF, Video, PPT)</p>
                  
                  {/* Fallback browse button */}
                  <label className="btn btn-primary btn-sm" style={{ marginTop: '12px', cursor: 'pointer', display: 'inline-block' }}>
                    Browse Files
                    <input type="file" multiple onChange={(e) => handleDrop({ preventDefault: ()=>{}, dataTransfer: { files: e.target.files }})} style={{ display: 'none' }} />
                  </label>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {files.map(f => (
                    <div key={f._id} style={{ ...s.fileCard, padding: '10px' }}>
                      <div style={{ ...s.fileIcon, width: '32px', height: '32px', fontSize: '16px' }}>📄</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {f.originalName}
                        </p>
                        <p style={{ fontSize: '10px', color: 'var(--text3)' }}>
                          {(f.size / 1024 / 1024).toFixed(2)} MB • {f.uploader?.name}
                        </p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <a href={`http://localhost:5000/uploads/${f.filename}`} download target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: '10px', minHeight: 'auto', height: 'auto' }}>⬇️</a>
                        {(isLeader || (f.uploader?._id || f.uploader) === user.id) && (
                          <button onClick={() => deleteFile(f._id)} className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: '10px', minHeight: 'auto', height: 'auto', color: 'var(--red)' }}>✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {files.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text3)', fontSize: '12px' }}>
                      No files uploaded yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {panel === 'chat' && (
            <div style={s.sidePanel} className="fade-up">
              <ChatBox projectId={id} members={project?.members || []} onClose={() => setPanel(null)} />
            </div>
          )}
          {panel === 'activity' && (
            <div style={s.sidePanel} className="fade-up">
              <ActivityFeed projectId={id} onClose={() => setPanel(null)} />
            </div>
          )}
          {panel === 'ai' && (
            <div style={s.sidePanel} className="fade-up">
              <AIAssistant project={project} tasks={tasks} onClose={() => setPanel(null)} />
            </div>
          )}
        </div>
      </div>

      {(modal || editTask) && (
        <CreateTaskModal
          projectId={id}
          members={project?.members || []}
          taskToEdit={editTask}
          onClose={() => { setModal(false); setEditTask(null); }}
          onCreated={task => setTasks(p => [...p, task])}
          onUpdated={task => setTasks(p => p.map(t => t._id === task._id ? task : t))}
        />
      )}

      {/* Floating AI Assistant — bottom right */}
      <div style={s.fab}>
        {showAI && (
          <div style={s.aiPopup} className="scale-in">
            <AIAssistant project={project} tasks={tasks} onClose={() => setShowAI(false)} />
          </div>
        )}
        <button
          style={{
            ...s.fabBtn,
            background: showAI ? 'var(--grad-ai)' : 'var(--grad)',
            boxShadow: showAI ? '0 4px 24px rgba(139,92,246,0.45)' : '0 4px 20px rgba(37,99,235,0.4)',
          }}
          onClick={() => setShowAI(v => !v)}
          title="AI Assistant"
        >
          {showAI ? '✕' : '✦'}
        </button>
      </div>
    </div>
  );
}

const s = {
  page:        { minHeight: '100vh', background: 'var(--bg)' },
  wrap:        { maxWidth: '1400px', margin: '0 auto', padding: '24px 20px' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' },
  hl:          { display: 'flex', alignItems: 'center', gap: '14px' },
  badge:       { width: '44px', height: '44px', borderRadius: '10px', background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '18px', color: '#fff', flexShrink: 0 },
  title:       { fontSize: '22px', fontWeight: '800', letterSpacing: '-0.03em', marginBottom: '2px' },
  desc:        { fontSize: '12px', color: 'var(--text3)' },
  hr:          { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  progress:    { display: 'flex', alignItems: 'center', gap: '8px' },
  progressBar: { width: '80px', height: '4px', background: 'var(--bg4)', borderRadius: '99px', overflow: 'hidden' },
  progressFill:{ height: '100%', background: 'var(--grad)', borderRadius: '99px', transition: 'width 0.5s ease' },
  progressTxt: { fontSize: '11px', color: 'var(--text2)', fontWeight: '600', minWidth: '30px' },
  mems:        { display: 'flex', alignItems: 'center' },
  memAv:       { width: '28px', height: '28px', borderRadius: '50%', background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '11px', color: '#fff', border: '2px solid var(--bg)', cursor: 'default' },
  aiBar:       { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' },
  aiLeft:      { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  aiLabel:     { fontSize: '11px', fontWeight: '600', color: 'var(--ai)', letterSpacing: '0.06em', marginRight: '4px' },
  aiRight:     { display: 'flex', alignItems: 'center', gap: '8px' },
  memBox:      { background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: '16px' },
  aiDropdown:  {
    position: 'fixed', top: 'auto', right: 'auto',
    background: 'var(--bg2)', border: '1px solid var(--border2)',
    borderRadius: 'var(--radius-lg)', padding: '8px',
    boxShadow: 'var(--shadow-lg)', zIndex: 9999,
    display: 'flex', flexDirection: 'column', gap: '6px',
    minWidth: '220px',
  },
  board:       { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' },
  col:         { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '14px', minHeight: '500px', display: 'flex', flexDirection: 'column' },
  colHead:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' },
  colLeft:     { display: 'flex', alignItems: 'center', gap: '8px' },
  colLabel:    { fontSize: '13px', fontWeight: '600', letterSpacing: '-0.01em' },
  colBadge:    { borderRadius: '99px', padding: '1px 8px', fontSize: '11px', fontWeight: '700' },
  drop:        { flex: 1, borderRadius: 'var(--radius)', border: '2px dashed transparent', transition: 'all 0.15s', padding: '2px', minHeight: '400px' },
  emptyCol:    { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '160px' },
  sidePanel:   { position: 'sticky', top: '68px', height: 'calc(100vh - 100px)' },
  fab:         { position: 'fixed', bottom: '28px', right: '28px', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' },
  fabBtn:      { width: '52px', height: '52px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#fff', transition: 'all 0.2s ease', flexShrink: 0 },
  aiPopup:     { width: '360px', height: '520px', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 12px 50px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column' },
  taskSection: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', marginBottom: '16px', overflow: 'hidden' },
  taskTabBar:  { display: 'flex', gap: '4px', padding: '10px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' },
  taskTabBtn:  { padding: '5px 12px', fontSize: '12px', borderRadius: '99px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', border: '1px solid transparent' },
  taskGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px', padding: '12px' },
  taskCard:    { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', transition: 'box-shadow 0.15s ease' },
  viewBtn:     { padding: '4px 12px', fontSize: '12px', fontWeight: '600', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', transition: 'all 0.15s' },
  filesZone:   { border: '2px dashed', borderRadius: 'var(--radius-xl)', overflow: 'hidden', minHeight: '500px', transition: 'all 0.2s' },
  fileCard:    { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' },
  fileIcon:    { width: '36px', height: '36px', borderRadius: '8px', background: 'var(--bg4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }
};