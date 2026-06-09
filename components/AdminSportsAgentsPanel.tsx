import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Laptop,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Server,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  fetchSportsAgentRuns,
  fetchSportsEventResearch,
  LOCAL_AGENT_COMMAND,
  runCloudSportsResearchJob,
  SPORTS_RESEARCH_WINDOWS,
  type SportsAgentRunView,
  type SportsEventResearchView,
} from '../services/adminSportsOpsService';

const fmtDate = (value?: string | number) => {
  if (!value) return 'Pending';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const statusClass = (status?: string) => {
  if (status === 'completed') return 'bg-green-500/15 text-green-300 border-green-500/20';
  if (status === 'failed') return 'bg-red-500/15 text-red-300 border-red-500/20';
  if (status === 'skipped') return 'bg-yellow-500/15 text-yellow-200 border-yellow-500/20';
  return 'bg-white/10 text-white/40 border-white/10';
};

const AdminSportsAgentsPanel: React.FC = () => {
  const [runs, setRuns] = useState<SportsAgentRunView[]>([]);
  const [dossiers, setDossiers] = useState<SportsEventResearchView[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const latestRun = runs[0];
  const totals = useMemo(() => {
    const lastCounts = latestRun?.counts ?? {};
    return {
      dossiers: dossiers.length,
      events: lastCounts.eventResearchDossiers ?? 0,
      players: (lastCounts.eventPlayerProfiles ?? 0) + (lastCounts.playerProfiles ?? 0),
      teams: (lastCounts.eventTeamPages ?? 0) + (lastCounts.teamPages ?? 0),
    };
  }, [dossiers.length, latestRun]);

  const load = async () => {
    setLoading(true);
    try {
      const [nextRuns, nextDossiers] = await Promise.all([
        fetchSportsAgentRuns(),
        fetchSportsEventResearch(),
      ]);
      setRuns(nextRuns);
      setDossiers(nextDossiers);
    } catch (err: any) {
      setMessage(err?.message || 'Could not load sports agent activity.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const launchDeepResearch = async () => {
    setLaunching(true);
    setMessage('Launching deep sports research agent...');
    try {
      await runCloudSportsResearchJob({
        scope: 'deep',
        investigateEvents: true,
        includeHistory: true,
        maxEventsPerLeague: 24,
        maxTeamsPerLeague: 24,
        maxPlayersPerTeam: 18,
      });
      setMessage('Deep research run completed. Refreshing activity.');
      await load();
    } catch (err: any) {
      setMessage(err?.message || 'Sports research run failed.');
    } finally {
      setLaunching(false);
    }
  };

  const copyLocalCommand = async () => {
    await navigator.clipboard?.writeText(LOCAL_AGENT_COMMAND);
    setMessage('Local agent command copied.');
  };

  return (
    <div className="space-y-10">
      <header className="flex flex-col xl:flex-row xl:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-3 mb-4 text-small-orange">
            <Trophy size={24} />
            <span className="text-[10px] font-black uppercase tracking-[0.45em]">Sports Intelligence Ops</span>
          </div>
          <h1 className="text-6xl md:text-[9rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">Sports Agents</h1>
          <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-4 max-w-3xl">
            Monitor Plajah Sports research agents, event dossiers, roster discovery, schedules, and local-device research jobs.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <button
            onClick={launchDeepResearch}
            disabled={launching}
            className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 disabled:opacity-50 transition-all"
          >
            {launching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Deep Cloud Run
          </button>
        </div>
      </header>

      {message && (
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50">
          {message}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Latest Status', value: latestRun?.status ?? 'No Runs', icon: Activity },
          { label: 'Event Dossiers', value: totals.dossiers, icon: Search },
          { label: 'Teams Touched', value: totals.teams, icon: Trophy },
          { label: 'Players Sampled', value: totals.players, icon: Database },
        ].map(item => (
          <div key={item.label} className="p-6 bg-white/5 border border-white/10 rounded-2xl">
            <item.icon size={18} className="text-small-orange mb-5" />
            <p className="text-3xl font-black uppercase tracking-tight">{item.value}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mt-1">{item.label}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_0.8fr] gap-6">
        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Server size={18} className="text-small-orange" />
              <h2 className="text-sm font-black uppercase tracking-widest">Cloud Research Windows</h2>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-white/30">America/New_York default</span>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            {SPORTS_RESEARCH_WINDOWS.map(window => (
              <div key={window} className="px-4 py-3 rounded-2xl bg-black/30 border border-white/10 flex items-center gap-3">
                <Clock size={14} className="text-white/30" />
                <span className="text-[10px] font-black uppercase tracking-widest">{window}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center gap-3">
            <Laptop size={18} className="text-small-orange" />
            <h2 className="text-sm font-black uppercase tracking-widest">Deploy Local Device Agent</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-xs font-bold text-white/40 leading-relaxed">
              Runs the same investigative worker on an admin-controlled machine, helping reduce cloud compute while still writing findings back to the platform database.
            </p>
            <div className="flex items-center gap-2 p-4 bg-black/40 border border-white/10 rounded-2xl">
              <code className="flex-1 text-[10px] text-white/60 break-all">{LOCAL_AGENT_COMMAND}</code>
              <button onClick={copyLocalCommand} className="p-2 bg-white/10 hover:bg-white hover:text-black rounded-xl transition-all" title="Copy command">
                <Copy size={14} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center gap-3">
            <Zap size={18} className="text-small-orange" />
            <h2 className="text-sm font-black uppercase tracking-widest">Recent Agent Runs</h2>
          </div>
          <div className="divide-y divide-white/10">
            {runs.map(run => (
              <div key={run.id} className="p-5 flex gap-4">
                <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center ${statusClass(run.status)}`}>
                  {run.status === 'completed' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-black uppercase tracking-widest">{run.reason}</p>
                    <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest ${statusClass(run.status)}`}>{run.status}</span>
                    <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/30 text-[8px] font-black uppercase tracking-widest">{run.scope}</span>
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-white/25 mt-1">{fmtDate(run.finishedAt)} • {run.leagues?.length ?? 0} leagues</p>
                  {run.errors?.length > 0 && <p className="text-[9px] font-bold text-red-300/70 mt-2">{run.errors[0].label}: {run.errors[0].message}</p>}
                </div>
              </div>
            ))}
            {!loading && runs.length === 0 && <p className="p-8 text-xs font-bold text-white/30">No sports agent runs have been recorded yet.</p>}
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center gap-3">
            <Search size={18} className="text-small-orange" />
            <h2 className="text-sm font-black uppercase tracking-widest">Latest Event Research</h2>
          </div>
          <div className="divide-y divide-white/10 max-h-[620px] overflow-y-auto custom-scrollbar">
            {dossiers.map(item => (
              <div key={item.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-widest truncate">{item.name || item.shortName || item.eventId}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/25 mt-1">
                      {item.league} • {fmtDate(item.date)} • {item.venue || 'Venue pending'}
                    </p>
                  </div>
                  <span className="px-2 py-1 rounded-lg bg-small-orange/15 text-small-orange text-[8px] font-black uppercase tracking-widest shrink-0">
                    {item.status || 'Tracking'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(item.competitors ?? []).slice(0, 4).map((team, idx) => (
                    <span key={`${item.id}-${team.teamId || idx}`} className="px-3 py-1 bg-black/30 rounded-full text-[8px] font-black uppercase tracking-widest text-white/40">
                      {team.teamName || team.teamId}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {!loading && dossiers.length === 0 && <p className="p-8 text-xs font-bold text-white/30">No event dossiers found yet. Launch a deep run to start research.</p>}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminSportsAgentsPanel;
