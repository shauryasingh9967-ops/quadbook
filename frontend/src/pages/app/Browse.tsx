import { Building2, SearchX, Users, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLoad } from '../../components/hooks';
import { categoryIcon } from '../../components/icons';
import { Card, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, Select, Skeleton, StatusBadge, Tabs } from '../../components/ui';
import { get } from '../../lib/api';
import type { Kind, Lookups, Resource } from '../../lib/types';
import { useBase } from '../../components/bookingBits';

const KINDS: Array<{ value: Kind | ''; label: string }> = [{ value: '', label: 'All' }, { value: 'lab', label: 'Labs' }, { value: 'classroom', label: 'Classrooms' }, { value: 'hall', label: 'Halls' }, { value: 'equipment', label: 'Equipment' }];

export function ResourceCard({ r }: { r: Resource }) {
  const base = useBase();
  const Icon = categoryIcon(r.categoryIcon);
  return (
    <Link to={`${base}/resources/${r.id}`} className="group block h-full">
      <Card className="flex h-full flex-col p-5 transition-[border-color,transform] duration-150 group-hover:-translate-y-0.5 group-hover:border-primary">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary"><Icon className="size-5" aria-hidden /></span>
          <StatusBadge status={r.status} />
        </div>
        <h3 className="mt-4 text-lg group-hover:text-primary">{r.name}</h3>
        <p className="mt-1 text-sm text-muted">{r.categoryName}</p>
        <div className="mt-4 space-y-1.5 text-[13px] text-muted">
          <p className="flex items-center gap-2"><Building2 className="size-4 shrink-0" />{r.buildingName}, room {r.roomNumber}</p>
          <p className="flex items-center gap-2"><Users className="size-4 shrink-0" />Up to {r.capacity} people{r.equipmentCount ? ` · ${r.equipmentCount} equipment items` : ''}</p>
          {r.status === 'maintenance' && <p className="flex items-center gap-2 text-warn"><Wrench className="size-4 shrink-0" />Under maintenance right now</p>}
        </div>
        <p className="mt-auto pt-4 text-xs font-semibold text-primary">{r.requiresApproval ? 'Needs admin approval' : 'Confirms instantly'}</p>
      </Card>
    </Link>
  );
}

export default function Browse() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const kind = (sp.get('kind') ?? '') as Kind | '';
  const [building, setBuilding] = useState(''); const [minCap, setMinCap] = useState(''); const [sort, setSort] = useState('name'); const [page, setPage] = useState(1);
  const lookups = useLoad(async () => (await get<Lookups>('/resources/lookups')).data, []);
  const { data, loading, error, reload } = useLoad(() => get<Resource[]>('/resources', { q, kind, buildingId: building, minCapacity: minCap, sort, page, limit: 9 }), [q, kind, building, minCap, sort, page]);
  const set = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div>
      <PageHeader title="Browse resources" subtitle="Labs, classrooms, halls and portable equipment across all buildings." />
      <div className="mb-6 space-y-4">
        <Tabs value={kind} onChange={(v) => set(() => setSp(v ? { kind: v } : {}))} items={KINDS} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <SearchInput value={q} onChange={(v) => set(() => setQ(v))} placeholder="Search by name, building or equipment" />
          <Select aria-label="Building" value={building} onChange={(e) => set(() => setBuilding(e.target.value))}><option value="">All buildings</option>{lookups.data?.buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          <Select aria-label="Minimum capacity" value={minCap} onChange={(e) => set(() => setMinCap(e.target.value))}><option value="">Any capacity</option><option value="10">10+ people</option><option value="30">30+ people</option><option value="60">60+ people</option><option value="150">150+ people</option></Select>
          <Select aria-label="Sort" value={sort} onChange={(e) => set(() => setSort(e.target.value))}><option value="name">Name A–Z</option><option value="capacity">Largest first</option><option value="capacity_asc">Smallest first</option><option value="popular">Most booked</option></Select>
        </div>
      </div>
      {error ? <Card><ErrorState message={error} onRetry={reload} /></Card> : loading && !data ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-56" />)}</div>
        : data && data.data.length === 0 ? <Card><EmptyState icon={<SearchX className="size-6" />} title="No resources match" body="Try removing a filter or searching for a different name." /></Card>
        : data && (<>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.data.map((r) => <ResourceCard key={r.id} r={r} />)}</div>
          {data.meta && <Card className="mt-6"><Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} limit={data.meta.limit} onPage={setPage} /></Card>}
        </>)}
    </div>
  );
}
