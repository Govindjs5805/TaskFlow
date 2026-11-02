import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  LayoutDashboard, CheckSquare, BriefcaseBusiness, CalendarDays, Bell, Moon, Sun,
  Plus, Search, Menu, X, Check, Trash2, Pencil, ExternalLink, Clock3, Target,
  TrendingUp, CircleAlert, LogOut, ChevronLeft, ChevronRight, Filter,
  Kanban, List as ListIcon, Table as TableIcon, Layers, Code2, BarChart3
} from "lucide-react";
import { format, isToday, isTomorrow, isPast, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth, parseISO } from "date-fns";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { Task, Application, EventItem, Priority, JobStatus, TaskStatus, ApplicationRound, DsaProblem } from "./types";
const TaskKanban = lazy(() => import("./components/kanban/TaskKanban").then((module) => ({ default: module.TaskKanban })));
const JobKanban = lazy(() => import("./components/kanban/JobKanban").then((module) => ({ default: module.JobKanban })));
const ApplicationRoundsModal = lazy(() => import("./components/pipeline/ApplicationRoundsModal").then((module) => ({ default: module.ApplicationRoundsModal })));
const NotificationSettingsBanner = lazy(() => import("./components/notifications/NotificationSettingsBanner").then((module) => ({ default: module.NotificationSettingsBanner })));
const DsaTracker = lazy(() => import("./components/dsa/DsaTracker").then((module) => ({ default: module.DsaTracker })));
const AnalyticsDashboard = lazy(() => import("./components/analytics/AnalyticsDashboard").then((module) => ({ default: module.AnalyticsDashboard })));
import { DEFAULT_WEEKLY_GOALS, normalizeWeeklyGoals, type WeeklyGoals } from "./lib/analytics";
import { registerServiceWorker, checkAndDispatchScheduledReminders } from "./lib/notifications";

type Tab = "Overview" | "My Tasks" | "Job Tracker" | "DSA Tracker" | "Analytics" | "Calendar" | "Reminders";
const statuses: JobStatus[] = ["Applied","Assessment Scheduled","Assessment Completed","Interview Call","Technical Round","HR Round","Selected","Rejected","On Hold","Withdrawn"];
const demoTasks: Task[] = [
  {id:"t1",title:"Complete two array problems",description:"Practice sliding window and hash map patterns",category:"Placement Prep",priority:"High",due_at:new Date(Date.now()+86400000).toISOString(),reminder_at:null,completed:false},
  {id:"t2",title:"Review Helen AI project progress",description:"Update implementation notes",category:"College",priority:"Medium",due_at:new Date().toISOString(),reminder_at:null,completed:false},
  {id:"t3",title:"Update resume and portfolio",description:"Add recent project work",category:"Career",priority:"Medium",due_at:null,reminder_at:null,completed:true}
];
const demoApps: Application[] = [
  {id:"a1",company:"IBM",role:"Associate System Engineer",job_type:"Full-time",applied_at:"2026-10-15",job_url:"",status:"Assessment Scheduled",package_lpa:4.5,next_step:"Prepare for coding assessment",notes:""},
  {id:"a2",company:"Infosys",role:"System Engineer",job_type:"On-campus",applied_at:"2026-10-20",job_url:"",status:"Applied",package_lpa:null,next_step:"Wait for update",notes:""}
];
const demoEvents: EventItem[] = [
  {id:"e1",title:"Coding assessment preparation",event_type:"Assessment",starts_at:new Date(Date.now()+86400000*2).toISOString(),reminder_at:new Date(Date.now()+86400000).toISOString(),application_id:"a1",notes:"Revise arrays and strings"}
];
const demoRounds: ApplicationRound[] = [
  {
    id: "r1",
    application_id: "a1",
    round_type: "Online Assessment",
    round_name: "Round 1: Coding & Aptitude Test",
    scheduled_at: new Date(Date.now() + 86400000 * 2).toISOString(),
    platform: "HackerRank",
    meeting_link: "https://hackerrank.com/tests/sample-oa",
    interviewer: "Automated Evaluation",
    status: "Scheduled",
    score: "",
    feedback: "",
    notes: "Sliding window, string manipulation and quantitative aptitude"
  },
  {
    id: "r2",
    application_id: "a1",
    round_type: "Technical Round 1",
    round_name: "Round 2: Technical Interview",
    scheduled_at: new Date(Date.now() + 86400000 * 5).toISOString(),
    platform: "Google Meet",
    meeting_link: "https://meet.google.com/abc-defg-hij",
    interviewer: "Senior Software Engineer",
    status: "Scheduled",
    score: "",
    feedback: "",
    notes: "Focus on Data Structures, OOP concepts and Helen AI project"
  }
];
const uid = () => crypto.randomUUID();
const niceDate = (s?: string | null) => s ? format(parseISO(s), "dd MMM yyyy") : "No date";
const dateTimeLocal = (s?: string | null) => s ? format(parseISO(s), "yyyy-MM-dd'T'HH:mm") : "";
const localIso = (s: string) => s ? new Date(s).toISOString() : null;

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

export default function App() {
  const [tab,setTab] = useState<Tab>("Overview");
  const [dark,setDark] = useState(()=>{
    try { return localStorage.getItem("taskflow-theme")==="dark"; }
    catch { return false; }
  });
  const [themeFallback,setThemeFallback] = useState(false);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const themeTransitionRef = useRef(false);
  const [mobileNav,setMobileNav] = useState(false);
  const [tasks,setTasks] = useState<Task[]>(isSupabaseConfigured?[]:demoTasks);
  const [apps,setApps] = useState<Application[]>(isSupabaseConfigured?[]:demoApps);
  const [events,setEvents] = useState<EventItem[]>(isSupabaseConfigured?[]:demoEvents);
  const [query,setQuery] = useState("");
  const [user,setUser] = useState<any>(null);
  const [authReady,setAuthReady] = useState(!isSupabaseConfigured);
  const [workspaceLoading,setWorkspaceLoading] = useState(isSupabaseConfigured);
  const [showAuth,setShowAuth] = useState(false);
  const [toast,setToast] = useState("");
  const [taskModal,setTaskModal] = useState(false);
  const [appModal,setAppModal] = useState(false);
  const [eventModal,setEventModal] = useState(false);
  const [editingTask,setEditingTask] = useState<Task|null>(null);
  const [editingApp,setEditingApp] = useState<Application|null>(null);
  const [month,setMonth] = useState(new Date());
  const [rounds,setRounds] = useState<ApplicationRound[]>(isSupabaseConfigured?[]:demoRounds);
  const [dsaProblems,setDsaProblems] = useState<DsaProblem[]>([]);
  const [dsaLoading,setDsaLoading] = useState(false);
  const [weeklyGoals,setWeeklyGoals] = useState<WeeklyGoals>(DEFAULT_WEEKLY_GOALS);
  const [selectedAppForRounds,setSelectedAppForRounds] = useState<Application|null>(null);
  const [taskViewMode,setTaskViewMode] = useState<"list"|"kanban">("list");
  const [jobViewMode,setJobViewMode] = useState<"table"|"kanban">("table");

  useEffect(()=>{
    try { localStorage.setItem("taskflow-theme",dark?"dark":"light"); }
    catch { /* The selected theme still applies for this session when storage is unavailable. */ }
  },[dark]);
  const toggleTheme = () => {
    if (themeTransitionRef.current) return;
    const nextDark = !dark;
    const prefersReducedMotion = typeof window.matchMedia==="function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const applyTheme = () => {
      document.documentElement.dataset.theme=nextDark?"dark":"light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content",nextDark?"#000000":"#FFFFFF");
      flushSync(()=>setDark(nextDark));
      try { localStorage.setItem("taskflow-theme",nextDark?"dark":"light"); }
      catch { /* Keep the in-memory theme change even when storage is unavailable. */ }
    };
    const finishTransition = () => {
      themeTransitionRef.current = false;
      document.documentElement.style.removeProperty("--theme-reveal-x");
      document.documentElement.style.removeProperty("--theme-reveal-y");
      document.documentElement.style.removeProperty("--theme-reveal-radius");
      setThemeFallback(false);
    };

    if (prefersReducedMotion) {
      applyTheme();
      return;
    }

    const bounds = themeButtonRef.current?.getBoundingClientRect();
    const viewTransitionDocument = document as ViewTransitionDocument;
    if (bounds && viewTransitionDocument.startViewTransition) {
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const radius = Math.hypot(
        Math.max(centerX, window.innerWidth - centerX),
        Math.max(centerY, window.innerHeight - centerY)
      );
      document.documentElement.style.setProperty("--theme-reveal-x",`${centerX}px`);
      document.documentElement.style.setProperty("--theme-reveal-y",`${centerY}px`);
      document.documentElement.style.setProperty("--theme-reveal-radius",`${radius}px`);
      themeTransitionRef.current = true;
      try {
        const transition = viewTransitionDocument.startViewTransition(applyTheme);
        void transition.finished.catch(()=>undefined).finally(finishTransition);
      } catch {
        finishTransition();
        applyTheme();
      }
      return;
    }

    // Older browsers get a short color transition; reduced-motion users get an instant update above.
    themeTransitionRef.current = true;
    setThemeFallback(true);
    applyTheme();
    window.setTimeout(finishTransition,220);
  };
  useEffect(()=>{ registerServiceWorker(); },[]);
  useEffect(()=>{
    checkAndDispatchScheduledReminders({ tasks, events, rounds, apps });
    const timer = window.setInterval(()=>{
      checkAndDispatchScheduledReminders({ tasks, events, rounds, apps });
    },30000);
    const onFocus = () => {
      if (document.visibilityState === "visible") {
        checkAndDispatchScheduledReminders({ tasks, events, rounds, apps });
      }
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  },[tasks, events, rounds, apps]);

  useEffect(()=>{
    if(!supabase) return;
    supabase.auth.getSession().then(({data,error})=>{
      if(error) notify(`Authentication check failed: ${error.message}`);
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    }).catch(error=>{
      setAuthReady(true);
      setWorkspaceLoading(false);
      notify(error instanceof Error ? error.message : "Could not check your session");
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,session)=>{
      setUser(session?.user??null);
      setAuthReady(true);
    });
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    if(!supabase) return;
    if(!authReady){setWorkspaceLoading(true);return;}
    if(!user){
      setTasks([]);
      setApps([]);
      setEvents([]);
      setRounds([]);
      setWorkspaceLoading(false);
      return;
    }
    let cancelled = false;
    setWorkspaceLoading(true);
    setTasks([]);
    setApps([]);
    setEvents([]);
    setRounds([]);
    (async()=>{
      try {
        const [t,a,e,r]=await Promise.all([
          supabase!.from("tasks").select("*").eq("user_id",user.id).order("created_at",{ascending:false}),
          supabase!.from("applications").select("*").eq("user_id",user.id).order("created_at",{ascending:false}),
          supabase!.from("events").select("*").eq("user_id",user.id).order("starts_at",{ascending:true}),
          supabase!.from("application_rounds").select("*").eq("user_id",user.id).order("scheduled_at",{ascending:true})
        ]);
        if(cancelled) return;
        if(t.error) notify(`Could not load tasks: ${t.error.message}`);
        else setTasks((t.data ?? []) as Task[]);
        if(a.error) notify(`Could not load applications: ${a.error.message}`);
        else setApps((a.data ?? []) as Application[]);
        if(e.error) notify(`Could not load events: ${e.error.message}`);
        else setEvents((e.data ?? []) as EventItem[]);
        if(r.error) notify(`Could not load application rounds: ${r.error.message}`);
        else setRounds((r.data ?? []) as ApplicationRound[]);
      } catch(error) {
        if(!cancelled) notify(error instanceof Error ? error.message : "Could not load your workspace data");
      } finally {
        if(!cancelled) setWorkspaceLoading(false);
      }
    })();
    return ()=>{cancelled = true;};
  },[user?.id,authReady]);

  useEffect(()=>{
    if(!supabase) return;
    if(!user){
      setDsaProblems([]);
      setDsaLoading(false);
      return;
    }

    let cancelled = false;
    setDsaProblems([]);
    setDsaLoading(true);
    (async()=>{
      try {
        const {data,error} = await supabase
          .from("dsa_problems")
          .select("*")
          .eq("user_id",user.id)
          .order("created_at",{ascending:false});
        if(cancelled) return;
        if(error) notify(error.message);
        else setDsaProblems((data ?? []) as DsaProblem[]);
      } catch(error) {
        if(!cancelled) notify(error instanceof Error ? error.message : "Could not load DSA problems");
      } finally {
        if(!cancelled) setDsaLoading(false);
      }
    })();
    return ()=>{cancelled = true;};
  },[user?.id]);

  useEffect(()=>{
    const userKey = user?.id ?? "preview";
    const storageKey = `taskflow-weekly-goals:${userKey}`;
    const stored = localStorage.getItem(storageKey);
    let localGoals: unknown = null;
    if(stored){
      try { localGoals = JSON.parse(stored); } catch { localGoals = null; }
    }
    const cloudGoals = user?.user_metadata?.taskflow_weekly_goals;
    const goals = normalizeWeeklyGoals(cloudGoals ?? localGoals);
    setWeeklyGoals(goals);
    if(cloudGoals) localStorage.setItem(storageKey,JSON.stringify(goals));
  },[user?.id]);

  const notify=(s:string)=>{setToast(s);window.setTimeout(()=>setToast(""),2600);};
  const saveWeeklyGoals=async(goals:WeeklyGoals)=>{
    const normalized = normalizeWeeklyGoals(goals);
    const storageKey = `taskflow-weekly-goals:${user?.id ?? "preview"}`;
    setWeeklyGoals(normalized);
    localStorage.setItem(storageKey,JSON.stringify(normalized));
    if(supabase && user){
      try {
        const {data,error} = await supabase.auth.updateUser({
          data:{...(user.user_metadata ?? {}),taskflow_weekly_goals:normalized}
        });
        if(error){notify(`Goals saved on this device, but cloud sync failed: ${error.message}`);return;}
        if(data.user) setUser(data.user);
      } catch(error) {
        notify(`Goals saved on this device, but cloud sync failed: ${error instanceof Error ? error.message : "unknown error"}`);
        return;
      }
    }
    notify("Weekly goals saved");
  };
  const persist = async (table:string, row:any, mode:"upsert"|"delete"="upsert"):Promise<boolean> => {
    if(!supabase) return true;
    if(!user){notify("Sign in to save changes to your account.");return false;}
    try {
      const result = mode==="delete"
        ? await supabase.from(table).delete().eq("id",row.id).eq("user_id",user.id)
        : await supabase.from(table).upsert({...row,user_id:user.id});
      if(result.error){notify(result.error.message);return false;}
      return true;
    } catch(error) {
      notify(error instanceof Error ? error.message : "Could not save your changes");
      return false;
    }
  };
  const saveDsaProblem = async (problem:DsaProblem) => {
    if(supabase && !user){notify("Sign in to save DSA problems.");throw new Error("Authentication required");}
    const existing = dsaProblems.find(item=>item.id===problem.id);
    const normalized: DsaProblem = {
      ...problem,
      solved_at: problem.status === "Solved"
        ? (problem.solved_at || (existing?.status === "Solved" ? existing.solved_at : null) || new Date().toISOString())
        : problem.solved_at ?? existing?.solved_at ?? null
    };
    setDsaProblems(old=>existing
      ? old.map(item=>item.id===normalized.id?normalized:item)
      : [normalized,...old]
    );

    if(supabase && user){
      try {
        const {error} = await supabase.from("dsa_problems").upsert({ ...normalized, user_id:user.id });
        if(error) throw error;
      } catch(error) {
        setDsaProblems(old=>existing
          ? old.map(item=>item.id===existing.id?existing:item)
          : old.filter(item=>item.id!==normalized.id)
        );
        notify(error instanceof Error ? error.message : (error as {message?:string})?.message || "Could not save DSA problem");
        throw error;
      }
    }
    notify(existing ? "Problem updated" : "Problem added");
  };
  const removeDsaProblem = async (id:string) => {
    if(supabase && !user){notify("Sign in to delete DSA problems.");throw new Error("Authentication required");}
    const existing = dsaProblems.find(item=>item.id===id);
    setDsaProblems(old=>old.filter(item=>item.id!==id));
    if(supabase && user){
      try {
        const {error} = await supabase.from("dsa_problems").delete().eq("id",id).eq("user_id",user.id);
        if(error) throw error;
      } catch(error) {
        if(existing) setDsaProblems(old=>old.some(item=>item.id===id)?old:[existing,...old]);
        notify(error instanceof Error ? error.message : (error as {message?:string})?.message || "Could not delete DSA problem");
        throw error;
      }
    }
  };
  const persistSubscription = async (subData: any, mode: "upsert" | "delete") => {
    if (!supabase || !user) throw new Error("Sign in to sync push subscriptions.");
    let result;
    if (mode === "delete") {
      if(!subData.endpoint) throw new Error("This device's push endpoint could not be identified.");
      result = await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint",subData.endpoint);
    } else {
      result = await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        endpoint: subData.endpoint,
        p256dh: subData.p256dh,
        auth_key: subData.auth_key,
        user_agent: subData.user_agent || navigator.userAgent
      }, { onConflict: "user_id,endpoint" });
    }
    if(result.error) throw result.error;
  };
  const saveTask=async (task:Task)=>{
    const normalizedTask: Task = {
      ...task,
      status: task.status || (task.completed ? "completed" : "todo"),
      completed_at: task.completed ? (task.completed_at || new Date().toISOString()) : null
    };
    if(!await persist("tasks",normalizedTask)) return;
    setTasks(old=>old.some(x=>x.id===normalizedTask.id)
      ? old.map(x=>x.id===normalizedTask.id?normalizedTask:x)
      : [normalizedTask,...old]);
    setTaskModal(false);setEditingTask(null);notify("Task saved");
  };
  const removeTask=async(id:string)=>{
    if(!await persist("tasks",{id},"delete")) return;
    setTasks(x=>x.filter(t=>t.id!==id));
  };
  const toggleTask=async(t:Task)=>{
    const willBeCompleted = !t.completed;
    const n: Task = {
      ...t,
      completed: willBeCompleted,
      status: willBeCompleted ? "completed" : "todo",
      completed_at: willBeCompleted ? (t.completed_at || new Date().toISOString()) : null
    };
    if(!await persist("tasks",n)) return;
    setTasks(x=>x.map(y=>y.id===t.id?n:y));
  };
  const moveTask=async(taskId:string,targetStatus:TaskStatus)=>{
    const isCompleted = targetStatus === "completed";
    const current = tasks.find(t=>t.id===taskId);
    if(!current) return;
    const updated: Task = {
      ...current,
      status: targetStatus,
      completed: isCompleted,
      completed_at: isCompleted ? (current.completed_at || new Date().toISOString()) : null
    };
    if(!await persist("tasks",updated)) return;
    setTasks(old=>old.map(t=>t.id===taskId?updated:t));
    notify(`Task moved to ${targetStatus==="in_progress"?"In Progress":targetStatus==="todo"?"To Do":"Completed"}`);
  };
  const saveApp=async(a:Application)=>{
    if(!await persist("applications",a)) return;
    setApps(old=>old.some(x=>x.id===a.id)?old.map(x=>x.id===a.id?a:x):[a,...old]);
    setAppModal(false);setEditingApp(null);notify("Application saved");
  };
  const removeApp=async(id:string)=>{
    if(!await persist("applications",{id},"delete")) return;
    setApps(x=>x.filter(a=>a.id!==id));
    setRounds(x=>x.filter(r=>r.application_id!==id));
  };
  const moveApplication=async(appId:string,newStatus:JobStatus)=>{
    const current = apps.find(a=>a.id===appId);
    if(!current) return;
    const updated: Application = { ...current, status: newStatus };
    if(!await persist("applications",updated)) return;
    setApps(old=>old.map(a=>a.id===appId?updated:a));
    notify(`Application moved to ${newStatus}`);
  };
  const saveRound=async(round:ApplicationRound):Promise<boolean>=>{
    if(!await persist("application_rounds",round)) return false;
    setRounds(old=>{
      const exists = old.some(r=>r.id===round.id);
      return exists ? old.map(r=>r.id===round.id?round:r) : [round,...old];
    });
    notify("Round updated");
    return true;
  };
  const removeRound=async(id:string):Promise<boolean>=>{
    if(!await persist("application_rounds",{id},"delete")) return false;
    setRounds(old=>old.filter(r=>r.id!==id));
    notify("Round removed");
    return true;
  };
  const updateApplicationStatus=async(appId:string,newStatus:JobStatus)=>{
    const app = apps.find(a=>a.id===appId);
    if(!app) return;
    const updated: Application = { ...app, status: newStatus };
    if(!await persist("applications",updated)) return;
    setApps(old=>old.map(a=>a.id===appId?updated:a));
    notify(`Application status updated to ${newStatus}`);
  };
  const saveEvent=async(e:EventItem)=>{
    if(!await persist("events",e)) return;
    setEvents(x=>[e,...x]);setEventModal(false);notify("Reminder added");
  };
  const removeEvent=async(id:string)=>{
    if(!await persist("events",{id},"delete")) return;
    setEvents(x=>x.filter(e=>e.id!==id));
  };
  const signIn=async(email:string,password:string,signup:boolean)=>{
    if(!supabase)return;
    try {
      const res=signup?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});
      if(res.error)notify(res.error.message);else {setShowAuth(false);notify(signup?"Check your email to confirm your account":"Signed in");}
    } catch(error) {
      notify(error instanceof Error ? error.message : "Could not complete authentication");
    }
  };
  const signOut=async()=>{
    if(!supabase){setUser(null);return;}
    try {
      const {error}=await supabase.auth.signOut();
      if(error){notify(error.message);return;}
      setUser(null);
    } catch(error) {
      notify(error instanceof Error ? error.message : "Could not sign out");
    }
  };
  const upcoming=useMemo(()=>[
    ...events.map(e=>({id:e.id,title:e.title,date:e.starts_at,kind:e.event_type,source:"event"})),
    ...tasks.filter(t=>!t.completed&&t.due_at).map(t=>({id:t.id,title:t.title,date:t.due_at!,kind:"Task due",source:"task"})),
    ...rounds.filter(r=>r.scheduled_at && r.status !== "Cleared" && r.status !== "Rejected" && r.status !== "Waived").map(r=>{
      const parentApp = apps.find(a=>a.id===r.application_id);
      return {
        id:`round-${r.id}`,
        title:`${parentApp?parentApp.company+": ":""}${r.round_name||r.round_type}`,
        date:r.scheduled_at!,
        kind:`${r.round_type} (${r.status})`,
        source:"round"
      };
    })
  ].filter(x=>new Date(x.date)>=new Date(Date.now()-86400000)).sort((a,b)=>+new Date(a.date)-+new Date(b.date)),[events,tasks,rounds,apps]);
  const pending=tasks.filter(t=>!t.completed);
  const completed=tasks.filter(t=>t.completed);
  const activeApps=apps.filter(a=>!["Selected","Rejected","Withdrawn"].includes(a.status));
  const filteredTasks=tasks.filter(t=>(t.title+" "+t.category+" "+t.description).toLowerCase().includes(query.toLowerCase()));
  const filteredApps=apps.filter(a=>(a.company+" "+a.role+" "+a.status).toLowerCase().includes(query.toLowerCase()));

  return <div className={`app${dark?" dark":""}${themeFallback?" theme-fallback":""}`}>
    <aside className={`sidebar ${mobileNav?"show":""}`}>
      <div className="brand"><div className="brand-icon"><img src="/logo.png" alt="" /></div><span>TaskFlow</span><button className="mobile-close icon-btn" onClick={()=>setMobileNav(false)}><X size={18}/></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{([
        ["Overview",LayoutDashboard],["My Tasks",CheckSquare],["Job Tracker",BriefcaseBusiness],["DSA Tracker",Code2],["Analytics",BarChart3],["Calendar",CalendarDays],["Reminders",Bell]
      ] as const).map(([label,Icon])=><button key={label} className={`nav-item ${tab===label?"active":""}`} onClick={()=>{setTab(label);setMobileNav(false);}}><Icon size={18}/><span>{label}</span>{label==="Reminders"&&upcoming.length>0&&<b className="nav-count">{upcoming.length}</b>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="mini-tip"><div className="tip-icon"><TrendingUp size={17}/></div><b>Small steps add up.</b><p>Keep your momentum going, one task at a time.</p></div>
        {isSupabaseConfigured&&<div className="account-row">{user?<><span className="avatar">{user.email?.[0]?.toUpperCase()}</span><span className="account-email">{user.email}</span><button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={16}/></button></>:<button className="outline-btn full" onClick={()=>setShowAuth(true)}>Sign in / Create account</button>}</div>}
        <div className="sidebar-foot">Made for your next milestone ✦</div>
      </div>
    </aside>
    {mobileNav&&<div className="scrim" onClick={()=>setMobileNav(false)}/>}
    <main className="main">
      <header className="topbar"><div className="top-left"><button className="icon-btn mobile-menu" onClick={()=>setMobileNav(true)}><Menu/></button><div><div className="eyebrow">YOUR PERSONAL WORKSPACE</div><h1>{tab==="Overview"?"Good to see you":tab}</h1></div></div><div className="top-actions"><div className="searchbox"><Search size={16}/><input placeholder="Search tasks or jobs..." value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌘ K</kbd></div><button ref={themeButtonRef} className="icon-btn theme-btn" onClick={toggleTheme} title={dark?"Switch to light theme":"Switch to dark theme"} aria-label={dark?"Switch to light theme":"Switch to dark theme"} aria-pressed={dark}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><button className="avatar profile" onClick={()=>isSupabaseConfigured?setShowAuth(true):notify("Add Supabase credentials to enable accounts.")}>{user?.email?.[0]?.toUpperCase()||"G"}</button></div></header>
      {!isSupabaseConfigured&&<div className="setup-banner"><CircleAlert size={17}/><span><b>Preview mode:</b> Add your Supabase project URL and anon key to <code>.env</code> to enable accounts and cloud sync. Your changes currently stay in this browser session.</span></div>}
      {workspaceLoading&&<div className="workspace-loading" role="status">Loading your account data…</div>}
      {tab==="Overview"&&<section className="page">
        <div className="welcome-row"><div><p className="muted">Here’s your progress at a glance.</p><h2>Make today count.</h2></div><button className="primary-btn" onClick={()=>{setEditingTask(null);setTaskModal(true)}}><Plus size={17}/> Add a task</button></div>
        <div className="stats-grid">
          <Stat icon={<CheckSquare/>} label="Open tasks" value={pending.length} hint={`${completed.length} completed`} tone="green"/>
          <Stat icon={<BriefcaseBusiness/>} label="Active applications" value={activeApps.length} hint={`${apps.length} total tracked`} tone="green"/>
          <Stat icon={<CalendarDays/>} label="Upcoming events" value={upcoming.length} hint="Tasks, exams & interviews" tone="green"/>
          <Stat icon={<TrendingUp/>} label="Selected" value={apps.filter(a=>a.status==="Selected").length} hint="Offers received" tone="green"/>
        </div>
        <div className="dashboard-grid">
          <div className="panel"><div className="panel-head"><div><h3>Today’s focus</h3><p className="muted">Your tasks, one step at a time</p></div><button className="text-btn" onClick={()=>setTab("My Tasks")}>View all <ChevronRight size={15}/></button></div>
            {pending.slice(0,5).map(t=><TaskRow key={t.id} task={t} onToggle={()=>toggleTask(t)} onEdit={()=>{setEditingTask(t);setTaskModal(true)}} onDelete={()=>removeTask(t.id)}/>)}{pending.length===0&&<Empty icon={<CheckSquare/>} title="All caught up!" body="Add a task to get started."/>}
          </div>
          <div className="panel"><div className="panel-head"><div><h3>Upcoming</h3><p className="muted">Important dates to remember</p></div><button className="text-btn" onClick={()=>setTab("Reminders")}>All reminders <ChevronRight size={15}/></button></div>
            {upcoming.slice(0,5).map(x=><div className="upcoming-row" key={x.id}><div className="date-tile"><b>{format(parseISO(x.date),"dd")}</b><span>{format(parseISO(x.date),"MMM")}</span></div><div className="upcoming-info"><b>{x.title}</b><span>{x.kind} · {format(parseISO(x.date),"h:mm a")}</span></div><span className="dot-status"/></div>)}{upcoming.length===0&&<Empty icon={<Bell/>} title="Nothing scheduled" body="Add an exam, interview or reminder."/>}
            <button className="soft-btn full" onClick={()=>setEventModal(true)}><Plus size={16}/> Add reminder</button>
          </div>
        </div>
        <div className="panel pipeline-panel"><div className="panel-head"><div><h3>Placement pipeline</h3><p className="muted">Track where each application stands</p></div><button className="text-btn" onClick={()=>setTab("Job Tracker")}>Manage applications <ChevronRight size={15}/></button></div><div className="pipeline">{["Applied","Assessment Scheduled","Interview Call","Selected"].map(s=><div className="pipeline-step" key={s}><strong>{apps.filter(a=>a.status===s).length}</strong><span>{s}</span></div>)}</div></div>
      </section>}
      {tab==="My Tasks"&&<section className="page">
        <div className="page-heading">
          <div><p className="muted">Plan, prioritize and get things done.</p><h2>Your tasks</h2></div>
          <button className="primary-btn" onClick={()=>{setEditingTask(null);setTaskModal(true)}}><Plus size={17}/> New task</button>
        </div>
        <div className="page-toolbar">
          <div className="task-summary">
            <span>{pending.length} open</span>
            <span>{completed.length} completed</span>
            <span>{tasks.length?Math.round(completed.length/tasks.length*100):0}% done</span>
          </div>
          <div className="view-mode-toggle" role="group" aria-label="Task view mode">
            <button className={`view-mode-btn ${taskViewMode==="list"?"active":""}`} onClick={()=>setTaskViewMode("list")}>
              <ListIcon size={14}/> List
            </button>
            <button className={`view-mode-btn ${taskViewMode==="kanban"?"active":""}`} onClick={()=>setTaskViewMode("kanban")}>
              <Kanban size={14}/> Kanban Board
            </button>
          </div>
        </div>
        {taskViewMode==="list" ? (
          <div className="panel task-list">
            {filteredTasks.map(t=><TaskRow key={t.id} task={t} onToggle={()=>toggleTask(t)} onEdit={()=>{setEditingTask(t);setTaskModal(true)}} onDelete={()=>removeTask(t.id)}/>)}
            {filteredTasks.length===0&&<Empty icon={<CheckSquare/>} title="No matching tasks" body="Try another search or create a new task."/>}
          </div>
        ) : (
          <Suspense fallback={<div className="panel">Loading task board…</div>}>
            <TaskKanban
              tasks={filteredTasks}
              onToggle={toggleTask}
              onEdit={(t)=>{setEditingTask(t);setTaskModal(true);}}
              onDelete={removeTask}
              onMoveTask={moveTask}
              onAddTask={(initialStatus)=>{
                setEditingTask({
                  id:uid(),
                  title:"",
                  description:"",
                  category:"Personal",
                  priority:"Medium",
                  due_at:null,
                  reminder_at:null,
                  completed:initialStatus==="completed",
                  status:initialStatus||"todo"
                });
                setTaskModal(true);
              }}
            />
          </Suspense>
        )}
      </section>}
      {tab==="Job Tracker"&&<section className="page">
        <div className="page-heading">
          <div><p className="muted">Every application, from applied to offer.</p><h2>Job applications</h2></div>
          <button className="primary-btn" onClick={()=>{setEditingApp(null);setAppModal(true)}}><Plus size={17}/> Add application</button>
        </div>
        <div className="page-toolbar">
          <div className="job-summary" style={{margin:0, flex:1}}>
            <div><b>{apps.length}</b><span>Total applications</span></div>
            <div><b>{activeApps.length}</b><span>In progress</span></div>
            <div><b>{apps.filter(a=>a.status==="Interview Call"||a.status==="Technical Round"||a.status==="HR Round").length}</b><span>Interview stages</span></div>
            <div><b>{apps.filter(a=>a.status==="Selected").length}</b><span>Selected</span></div>
          </div>
          <div className="view-mode-toggle" role="group" aria-label="Job view mode">
            <button className={`view-mode-btn ${jobViewMode==="table"?"active":""}`} onClick={()=>setJobViewMode("table")}>
              <TableIcon size={14}/> Table
            </button>
            <button className={`view-mode-btn ${jobViewMode==="kanban"?"active":""}`} onClick={()=>setJobViewMode("kanban")}>
              <Kanban size={14}/> Pipeline Board
            </button>
          </div>
        </div>
        {jobViewMode==="table" ? (
          <div className="panel table-panel">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Company / Role</th><th>Applied</th><th>Status</th><th>Rounds</th><th>Next step</th><th>Package</th><th></th></tr></thead>
                <tbody>
                  {filteredApps.map(a=>{
                    const appRounds = rounds.filter(r=>r.application_id===a.id);
                    return <tr key={a.id}>
                      <td><div className="company-cell"><div className="company-logo">{a.company.slice(0,1).toUpperCase()}</div><div><b>{a.company}</b><span>{a.role}</span></div></div></td>
                      <td>{niceDate(a.applied_at)}</td>
                      <td><select className={`status-select status-${a.status.toLowerCase().replaceAll(" ","-")}`} value={a.status} onChange={e=>moveApplication(a.id,e.target.value as JobStatus)}>{statuses.map(s=><option key={s}>{s}</option>)}</select></td>
                      <td>
                        <button
                          type="button"
                          className="rounds-count-badge"
                          onClick={()=>setSelectedAppForRounds(a)}
                          title="View and manage interview and assessment rounds"
                        >
                          <Layers size={13}/>
                          <span>{appRounds.length} {appRounds.length===1?"round":"rounds"}</span>
                        </button>
                      </td>
                      <td className="next-step">{a.next_step||"—"}</td>
                      <td>{a.package_lpa?`₹${a.package_lpa} LPA`:"—"}</td>
                      <td><div className="row-actions"><button className="icon-btn" title="Assessment & Interview Rounds" onClick={()=>setSelectedAppForRounds(a)}><Layers size={15}/></button><button className="icon-btn" title="Edit" onClick={()=>{setEditingApp(a);setAppModal(true)}}><Pencil size={15}/></button><button className="icon-btn danger" title="Delete" onClick={()=>removeApp(a.id)}><Trash2 size={15}/></button>{a.job_url&&<a className="icon-btn" href={a.job_url} target="_blank" rel="noreferrer"><ExternalLink size={15}/></a>}</div></td>
                    </tr>;
                  })}
                </tbody>
              </table>
              {filteredApps.length===0&&<Empty icon={<BriefcaseBusiness/>} title="No applications yet" body="Add your first job application to build your pipeline."/>}
            </div>
          </div>
        ) : (
          <Suspense fallback={<div className="panel">Loading placement board…</div>}>
            <JobKanban
              applications={filteredApps}
              rounds={rounds}
              onOpenRounds={(a)=>setSelectedAppForRounds(a)}
              onEdit={(a)=>{setEditingApp(a);setAppModal(true);}}
              onDelete={removeApp}
              onMoveApplication={moveApplication}
              onAddApplication={(initialStatus)=>{
                setEditingApp({
                  id:uid(),
                  company:"",
                  role:"",
                  job_type:"Full-time",
                  applied_at:format(new Date(),"yyyy-MM-dd"),
                  job_url:"",
                  status:initialStatus||"Applied",
                  package_lpa:null,
                  next_step:"",
                  notes:""
                });
                setAppModal(true);
              }}
            />
          </Suspense>
        )}
      </section>}
      {tab==="Analytics"&&<Suspense fallback={<section className="page"><div className="panel">Loading analytics…</div></section>}><AnalyticsDashboard tasks={tasks} problems={dsaProblems} applications={apps} goals={weeklyGoals} dsaLoading={dsaLoading} onSaveGoals={saveWeeklyGoals}/></Suspense>}
      {tab==="DSA Tracker"&&<Suspense fallback={<section className="page"><div className="panel">Loading DSA tracker…</div></section>}>
        {dsaLoading
          ? <section className="page"><div className="panel">Loading DSA problems…</div></section>
          : <DsaTracker problems={dsaProblems} onSaveProblem={saveDsaProblem} onDeleteProblem={removeDsaProblem} onNotify={notify}/>
        }
      </Suspense>}
      {tab==="Calendar"&&<section className="page"><div className="page-heading"><div><p className="muted">A clear view of what’s coming up.</p><h2>Your calendar</h2></div><button className="primary-btn" onClick={()=>setEventModal(true)}><Plus size={17}/> Add event</button></div><div className="calendar-layout"><div className="panel calendar-panel"><div className="calendar-top"><button className="icon-btn" onClick={()=>setMonth(subMonths(month,1))}><ChevronLeft/></button><h3>{format(month,"MMMM yyyy")}</h3><button className="icon-btn" onClick={()=>setMonth(addMonths(month,1))}><ChevronRight/></button></div><div className="calendar-grid">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><span className="weekday" key={d}>{d}</span>)}{Array.from({length:(startOfMonth(month).getDay()+6)%7},(_,i)=><span key={"blank"+i}/>)}{eachDayOfInterval({start:startOfMonth(month),end:endOfMonth(month)}).map(d=>{const dayEvents=[...events.filter(e=>format(parseISO(e.starts_at),"yyyy-MM-dd")===format(d,"yyyy-MM-dd")), ...tasks.filter(t=>t.due_at&&format(parseISO(t.due_at),"yyyy-MM-dd")===format(d,"yyyy-MM-dd")), ...rounds.filter(r=>r.scheduled_at&&format(parseISO(r.scheduled_at),"yyyy-MM-dd")===format(d,"yyyy-MM-dd")).map(r=>{const p=apps.find(a=>a.id===r.application_id);return {id:r.id,title:`${p?p.company+": ":""}${r.round_name||r.round_type}`,starts_at:r.scheduled_at!,event_type:r.round_type};})];return <button key={d.toISOString()} className={`calendar-day ${isToday(d)?"today":""} ${!isSameMonth(d,month)?"outside":""}`} onClick={()=>dayEvents.length?notify(dayEvents.map(x=>x.title).join(" · ")):null}><span>{format(d,"d")}</span>{dayEvents.length>0&&<i/>}</button>})}</div><div className="calendar-legend"><span><i className="legend-blue"/> Events</span><span><i className="legend-purple"/> Task due dates</span><span><i style={{background:"var(--primary)"}}/> Interview/OA rounds</span></div></div><div className="panel"><div className="panel-head"><div><h3>Schedule</h3><p className="muted">Upcoming dates</p></div></div>{upcoming.map(x=><div className="schedule-item" key={x.id}><div className="schedule-time">{format(parseISO(x.date),"dd MMM")}<small>{format(parseISO(x.date),"h:mm a")}</small></div><div><b>{x.title}</b><span>{x.kind}</span></div></div>)}</div></div></section>}
      {tab==="Reminders"&&<section className="page"><div className="page-heading"><div><p className="muted">Never miss an assessment, interview or deadline.</p><h2>Reminders</h2></div><button className="primary-btn" onClick={()=>setEventModal(true)}><Plus size={17}/> Add reminder</button></div>
      <Suspense fallback={<div className="notif-settings-card">Loading notification settings…</div>}><NotificationSettingsBanner user={user} onNotify={notify} onPersistSubscription={persistSubscription} /></Suspense>
      <div className="panel">{[
        ...events.map(e=>({id:e.id,title:e.title,type:e.event_type,time:e.starts_at,notes:e.notes,isPast:isPast(parseISO(e.starts_at)),source:"event" as const,onDelete:()=>removeEvent(e.id)})),
        ...rounds.filter(r=>r.scheduled_at).map(r=>{
          const parentApp = apps.find(a=>a.id===r.application_id);
          return {
            id:r.id,
            title:`${parentApp?parentApp.company+": ":""}${r.round_name||r.round_type}`,
            type:`${r.round_type} · ${r.status}`,
            time:r.scheduled_at!,
            notes:r.platform?`Platform: ${r.platform}${r.meeting_link?` · ${r.meeting_link}`:""}${r.interviewer?` · Interviewer: ${r.interviewer}`:""}`:r.notes,
            isPast:isPast(parseISO(r.scheduled_at!)),
            source:"round" as const,
            onManage:()=>parentApp&&setSelectedAppForRounds(parentApp),
            onDelete:()=>removeRound(r.id)
          };
        })
      ].sort((a,b)=>+new Date(a.time)-+new Date(b.time)).map(item=><div className="reminder-row" key={item.id}><div className="reminder-icon">{item.source==="round"?<Layers size={18}/>:<Bell size={18}/>}</div><div className="reminder-content"><b>{item.title}</b><span>{item.type} · {format(parseISO(item.time),"EEE, dd MMM yyyy · h:mm a")}</span>{item.notes&&<p>{item.notes}</p>}</div><div className="reminder-actions">{item.source==="round"&&item.onManage&&<button className="soft-badge-btn" onClick={item.onManage} title="Manage rounds"><Layers size={12}/> Manage</button>}<span className={item.isPast?"past-tag":"upcoming-tag"}>{item.isPast?"Past":"Upcoming"}</span><button className="icon-btn danger" onClick={item.onDelete} title="Delete"><Trash2 size={15}/></button></div></div>)}{events.length===0&&rounds.filter(r=>r.scheduled_at).length===0&&<Empty icon={<Bell/>} title="No reminders yet" body="Add a reminder for your next assessment or interview."/>}</div></section>}
      <footer className="footer">TaskFlow <span>·</span> Your goals, organized.</footer>
    </main>
    {taskModal&&<TaskDialog initial={editingTask} onClose={()=>{setTaskModal(false);setEditingTask(null)}} onSave={saveTask}/>}
    {appModal&&<ApplicationDialog initial={editingApp} onClose={()=>{setAppModal(false);setEditingApp(null)}} onSave={saveApp}/>}
    {eventModal&&<EventDialog apps={apps} onClose={()=>setEventModal(false)} onSave={saveEvent}/>}
    {selectedAppForRounds&&<Suspense fallback={<div className="modal-backdrop"><div className="modal">Loading application rounds…</div></div>}><ApplicationRoundsModal application={selectedAppForRounds} rounds={rounds} onClose={()=>setSelectedAppForRounds(null)} onSaveRound={saveRound} onDeleteRound={removeRound} onUpdateApplicationStatus={updateApplicationStatus}/></Suspense>}
    {showAuth&&<AuthDialog onClose={()=>setShowAuth(false)} onSubmit={signIn}/>}
    {toast&&<div className="toast">{toast}</div>}
  </div>;
}

function Stat({icon,label,value,hint,tone}:{icon:any;label:string;value:number;hint:string;tone:string}){return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></div>}
function Empty({icon,title,body}:{icon:any;title:string;body:string}){return <div className="empty-state"><div>{icon}</div><b>{title}</b><span>{body}</span></div>}
function TaskRow({task,onToggle,onEdit,onDelete}:{task:Task;onToggle:()=>void;onEdit:()=>void;onDelete:()=>void}){return <div className={`task-row ${task.completed?"is-done":""}`}><button className={`check-circle ${task.completed?"checked":""}`} onClick={onToggle}>{task.completed&&<Check size={13}/>}</button><div className="task-main"><b>{task.title}</b>{task.description&&<span>{task.description}</span>}<div className="task-meta"><span className="category-pill">{task.category}</span><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority} priority</span>{task.due_at&&<span className="due-meta"><Clock3 size={12}/>{niceDate(task.due_at)}</span>}</div></div><div className="row-actions"><button className="icon-btn" onClick={onEdit} title="Edit"><Pencil size={15}/></button><button className="icon-btn danger" onClick={onDelete} title="Delete"><Trash2 size={15}/></button></div></div>}
function Modal({title,children,onClose,onSubmit}:{title:string;children:any;onClose:()=>void;onSubmit:(e:any)=>void}){return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><form className="modal" onSubmit={onSubmit}><div className="modal-head"><h3>{title}</h3><button type="button" className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}</form></div>}
function Field({label,children}:{label:string;children:any}){return <label className="field"><span>{label}</span>{children}</label>}
function TaskDialog({initial,onClose,onSave}:{initial:Task|null;onClose:()=>void;onSave:(t:Task)=>void}){
  const [title,setTitle]=useState(initial?.title||"");
  const [description,setDescription]=useState(initial?.description||"");
  const [category,setCategory]=useState(initial?.category||"Personal");
  const [priority,setPriority]=useState<Priority>(initial?.priority||"Medium");
  const [status,setStatus]=useState<TaskStatus>(initial?.status || (initial?.completed ? "completed" : "todo"));
  const [due,setDue]=useState(dateTimeLocal(initial?.due_at));
  const [reminder,setReminder]=useState(dateTimeLocal(initial?.reminder_at));
  return <Modal title={initial?"Edit task":"Create a task"} onClose={onClose} onSubmit={e=>{
    e.preventDefault();
    if(title.trim()){
      const isCompleted = status === "completed";
      onSave({
        id:initial?.id||uid(),
        title:title.trim(),
        description,
        category,
        priority,
        status,
        completed:isCompleted,
        completed_at: isCompleted ? (initial?.completed_at || new Date().toISOString()) : null,
        due_at:localIso(due),
        reminder_at:localIso(reminder)
      });
    }
  }}>
    <Field label="Task title"><input autoFocus required value={title} onChange={e=>setTitle(e.target.value)} placeholder="What needs to get done?"/></Field>
    <Field label="Description"><textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Add details (optional)"/></Field>
    <div className="form-grid">
      <Field label="Category"><select value={category} onChange={e=>setCategory(e.target.value)}>{["Personal","Placement Prep","College","Career","Project","Other"].map(x=><option key={x}>{x}</option>)}</select></Field>
      <Field label="Priority"><select value={priority} onChange={e=>setPriority(e.target.value as Priority)}>{["Low","Medium","High"].map(x=><option key={x}>{x}</option>)}</select></Field>
      <Field label="Status"><select value={status} onChange={e=>setStatus(e.target.value as TaskStatus)}><option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></select></Field>
      <Field label="Due date"><input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></Field>
      <Field label="Reminder time"><input type="datetime-local" value={reminder} onChange={e=>setReminder(e.target.value)}/></Field>
    </div>
    <div className="modal-actions"><button type="button" className="outline-btn" onClick={onClose}>Cancel</button><button className="primary-btn" type="submit">Save task</button></div>
  </Modal>;
}
function ApplicationDialog({initial,onClose,onSave}:{initial:Application|null;onClose:()=>void;onSave:(a:Application)=>void}){const [company,setCompany]=useState(initial?.company||"");const [role,setRole]=useState(initial?.role||"");const [jobType,setJobType]=useState(initial?.job_type||"Full-time");const [applied,setApplied]=useState(initial?.applied_at||format(new Date(),"yyyy-MM-dd"));const [url,setUrl]=useState(initial?.job_url||"");const [status,setStatus]=useState<JobStatus>(initial?.status||"Applied");const [pkg,setPkg]=useState(initial?.package_lpa?.toString()||"");const [next,setNext]=useState(initial?.next_step||"");const [notes,setNotes]=useState(initial?.notes||"");return <Modal title={initial?"Edit application":"Add job application"} onClose={onClose} onSubmit={e=>{e.preventDefault();if(company.trim()&&role.trim())onSave({id:initial?.id||uid(),company,role,job_type:jobType,applied_at:applied||null,job_url:url,status,package_lpa:pkg?Number(pkg):null,next_step:next,notes});}}><div className="form-grid"><Field label="Company"><input required value={company} onChange={e=>setCompany(e.target.value)} placeholder="e.g. IBM"/></Field><Field label="Job role"><input required value={role} onChange={e=>setRole(e.target.value)} placeholder="e.g. Associate System Engineer"/></Field><Field label="Job type"><select value={jobType} onChange={e=>setJobType(e.target.value)}>{["Full-time","Internship","On-campus","Off-campus","Contract"].map(x=><option>{x}</option>)}</select></Field><Field label="Applied date"><input type="date" value={applied} onChange={e=>setApplied(e.target.value)}/></Field><Field label="Current status"><select value={status} onChange={e=>setStatus(e.target.value as JobStatus)}>{statuses.map(x=><option>{x}</option>)}</select></Field><Field label="Package (LPA)"><input type="number" min="0" step="0.1" value={pkg} onChange={e=>setPkg(e.target.value)} placeholder="e.g. 4.5"/></Field></div><Field label="Application / job link"><input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."/></Field><Field label="Next step"><input value={next} onChange={e=>setNext(e.target.value)} placeholder="e.g. Coding assessment on Friday"/></Field><Field label="Notes"><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Recruiter details, test platform, notes..."/></Field><div className="modal-actions"><button type="button" className="outline-btn" onClick={onClose}>Cancel</button><button className="primary-btn" type="submit">Save application</button></div></Modal>}
function EventDialog({apps,onClose,onSave}:{apps:Application[];onClose:()=>void;onSave:(e:EventItem)=>void}){const [title,setTitle]=useState("");const [type,setType]=useState("Assessment");const [starts,setStarts]=useState("");const [reminder,setReminder]=useState("");const [app,setApp]=useState("");const [notes,setNotes]=useState("");return <Modal title="Add a reminder" onClose={onClose} onSubmit={e=>{e.preventDefault();if(title.trim()&&starts)onSave({id:uid(),title,event_type:type,starts_at:new Date(starts).toISOString(),reminder_at:localIso(reminder),application_id:app||null,notes});}}><Field label="Title"><input autoFocus required value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. IBM coding assessment"/></Field><div className="form-grid"><Field label="Type"><select value={type} onChange={e=>setType(e.target.value)}>{["Assessment","Interview","Deadline","Follow-up","Exam","Reminder"].map(x=><option>{x}</option>)}</select></Field><Field label="Date & time"><input required type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)}/></Field><Field label="Remind me at"><input type="datetime-local" value={reminder} onChange={e=>setReminder(e.target.value)}/></Field><Field label="Related application"><select value={app} onChange={e=>setApp(e.target.value)}><option value="">None</option>{apps.map(a=><option value={a.id}>{a.company} — {a.role}</option>)}</select></Field></div><Field label="Notes"><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What should you prepare?"/></Field><div className="modal-actions"><button type="button" className="outline-btn" onClick={onClose}>Cancel</button><button className="primary-btn" type="submit">Save reminder</button></div></Modal>}
function AuthDialog({onClose,onSubmit}:{onClose:()=>void;onSubmit:(email:string,password:string,signup:boolean)=>void}){const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [signup,setSignup]=useState(false);return <Modal title={signup?"Create your TaskFlow account":"Sign in to TaskFlow"} onClose={onClose} onSubmit={e=>{e.preventDefault();onSubmit(email,password,signup);}}><p className="muted auth-copy">Your tasks and applications will sync securely with your Supabase account.</p><Field label="Email"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Password"><input type="password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)}/></Field><div className="modal-actions"><button type="button" className="text-btn" onClick={()=>setSignup(!signup)}>{signup?"Already have an account? Sign in":"New here? Create account"}</button><button className="primary-btn" type="submit">{signup?"Sign up":"Sign in"}</button></div></Modal>}
