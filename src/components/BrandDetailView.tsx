import React, { useState } from 'react';
import { usePublisher } from '../context/PublisherContext';
import { NewBrandModal } from './Modals';
import { brandIdFromPath } from '../lib/routes';
import { ArrowLeft, Pencil, FolderKanban, Video, Send, Users, Globe, Calendar } from 'lucide-react';

export const BrandDetailView: React.FC<{ setActiveTab?: (tab: string) => void }> = ({ setActiveTab }) => {
  const { brands, projects, videos, posts, accounts, campaigns, updateBrand } = usePublisher();
  const brandId = brandIdFromPath(window.location.pathname) || '';
  const brand = brands.find((b: any) => b.id === brandId);
  const [editOpen, setEditOpen] = useState(false);

  if (!brand) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-3">
        <p className="text-sm text-[var(--text-secondary)]">Brand not found or you don't have access.</p>
        {setActiveTab && <button onClick={() => setActiveTab('brands')} className="text-xs text-[var(--accent-primary)] hover:underline">Back to Brands</button>}
      </div>
    );
  }

  const bProjects = (projects || []).filter((p: any) => p.brandId === brand.id);
  const bVideos = (videos || []).filter((v: any) => v.brandId === brand.id);
  const bPosts = (posts || []).filter((p: any) => p.brandId === brand.id);
  const bAccounts = (accounts || []).filter((a: any) => a.brandId === brand.id);
  const bCampaigns = (campaigns || []).filter((c: any) => c.brandId === brand.id);
  const isArchived = (brand.status || 'active') === 'archived';

  const Section = ({ title, icon, children, empty }: any) => (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-4">
      <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2 mb-3">{icon}{title}</h3>
      {children || <p className="text-[11px] text-[var(--text-muted)]">{empty}</p>}
    </div>
  );

  return (
    <div className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      <button onClick={() => { window.history.pushState({}, '', '/brands'); window.dispatchEvent(new PopStateEvent('popstate')); }} className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] flex items-center gap-1.5">
        <ArrowLeft size={13} /> All Brands
      </button>

      {/* Cover hero */}
      <div className="relative rounded-2xl overflow-hidden border border-[var(--border-color)] min-h-[180px] sm:min-h-[220px]">
        {brand.coverImageUrl ? (
          <img src={brand.coverImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${brand.color || 'var(--border-color)'}33, var(--bg-main) 70%)` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="relative z-10 p-5 sm:p-7 flex items-end gap-4">
          {brand.logoUrl || brand.avatarUrl ? (
            <img src={brand.logoUrl || brand.avatarUrl} alt="" className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-contain bg-[var(--bg-surface-hover)] border border-[var(--border-color)] p-1" />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-[var(--text-primary)]" style={{ background: brand.color || '#00D6B2' }}>{brand.name.slice(0, 2).toUpperCase()}</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] truncate">{brand.name}</h1>
              <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${isArchived ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{isArchived ? 'archived' : 'active'}</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{brand.industry || brand.customIndustry || 'No industry set'}</p>
            {brand.description && <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2 max-w-xl">{brand.description}</p>}
          </div>
          <button onClick={() => setEditOpen(true)} className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-primary)] text-[11px] font-semibold hover:bg-[var(--bg-surface-hover)] flex items-center gap-1.5">
            <Pencil size={11} /> Edit Brand
          </button>
        </div>
      </div>

      {/* Overview strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Timezone', value: brand.timezone || '—', icon: <Globe size={12} /> },
          { label: 'Industry', value: brand.industry || '—', icon: <FolderKanban size={12} /> },
          { label: 'Created', value: brand.createdAt ? new Date(brand.createdAt).toLocaleDateString() : '—', icon: <Calendar size={12} /> },
          { label: 'Updated', value: brand.updatedAt ? new Date(brand.updatedAt).toLocaleDateString() : '—', icon: <Calendar size={12} /> },
        ].map((s, i) => (
          <div key={i} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-3">
            <p className="text-[9px] font-mono uppercase text-[var(--text-muted)] flex items-center gap-1">{s.icon}{s.label}</p>
            <p className="text-xs font-semibold text-[var(--text-primary)] mt-1 truncate">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Management sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Projects" icon={<FolderKanban size={13} />} empty="No projects yet.">
          {bProjects.length > 0 && <div className="space-y-1.5">{bProjects.slice(0, 6).map((p: any) => <p key={p.id} className="text-[11px] text-[var(--text-secondary)] flex justify-between"><span className="truncate">{p.name}</span><span className="font-mono text-[9px] text-[var(--text-muted)]">{p.status || 'planning'}</span></p>)}</div>}
        </Section>
        <Section title="Social Channels" icon={<Users size={13} />} empty="No channels connected.">
          {bAccounts.length > 0 && <div className="space-y-1.5">{bAccounts.slice(0, 6).map((a: any) => <p key={a.id} className="text-[11px] text-[var(--text-secondary)]">{a.platform} · {a.name || a.username || a.accountName || 'account'}</p>)}</div>}
        </Section>
        <Section title="Media Library" icon={<Video size={13} />} empty="No videos for this brand.">
          {bVideos.length > 0 && <div className="space-y-1.5">{bVideos.slice(0, 6).map((v: any) => <p key={v.id} className="text-[11px] text-[var(--text-secondary)] truncate">{v.title}</p>)}</div>}
        </Section>
        <Section title="Publishing" icon={<Send size={13} />} empty="No posts scheduled or published.">
          {bPosts.length > 0 && <div className="space-y-1.5">{bPosts.slice(0, 6).map((p: any) => <p key={p.id} className="text-[11px] text-[var(--text-secondary)] flex justify-between"><span className="truncate">{p.title}</span><span className="font-mono text-[9px] text-[var(--text-muted)]">{p.status}</span></p>)}</div>}
        </Section>
      </div>
      {bCampaigns.length > 0 && (
        <Section title="Campaigns" icon={<FolderKanban size={13} />} empty="">
          <div className="space-y-1.5">{bCampaigns.slice(0, 6).map((c: any) => <p key={c.id} className="text-[11px] text-[var(--text-secondary)]">{c.name} · {c.status}</p>)}</div>
        </Section>
      )}

      <NewBrandModal isOpen={editOpen} onClose={() => setEditOpen(false)} brand={brand} />
    </div>
  );
};
