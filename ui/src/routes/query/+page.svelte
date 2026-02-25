<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		getSpans,
		getAnalyticsSummary,
		spanStatus,
		spanStartedAt,
		spanEndedAt,
		spanDurationMs,
		spanKindLabel,
		shortId,
		type Span,
		type SpanFilter,
		type AnalyticsSummary
	} from '$lib/api';
	import { parseDsl, filterToDsl, parseRelativeTime } from '$lib/query-dsl';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import SpanKindIcon from '$lib/components/SpanKindIcon.svelte';
	import { onMount } from 'svelte';

	// ─── State ──────────────────────────────────────────────────────────

	let dslInput = $state('');
	let filter: SpanFilter = $state({});
	let results: Span[] = $state([]);
	let resultCount = $state(0);
	let queryTimeMs = $state(0);
	let loading = $state(false);
	let hasQueried = $state(false);

	// Analytics summary for autocomplete
	let summary: AnalyticsSummary | null = $state(null);

	// Search autocomplete
	let searchFocused = $state(false);
	let searchInputEl: HTMLInputElement | undefined = $state(undefined);
	let selectedSuggestionIdx = $state(-1);

	// View mode
	type ViewMode = 'table' | 'grouped' | 'scatter';
	let viewMode: ViewMode = $state('table');

	// History
	interface HistoryEntry {
		dsl: string;
		timestamp: number;
		resultCount: number;
	}

	let history: HistoryEntry[] = $state([]);
	const HISTORY_KEY = 'traceway:query-history';
	const MAX_HISTORY = 50;

	// ─── Sorting ────────────────────────────────────────────────────────

	type SortField = 'name' | 'kind' | 'model' | 'status' | 'duration' | 'tokens' | 'cost' | 'started_at';
	let sortField: SortField = $state('started_at');
	let sortAsc = $state(false);

	function toggleSort(field: SortField) {
		if (sortField === field) {
			sortAsc = !sortAsc;
		} else {
			sortField = field;
			sortAsc = false;
		}
		filter.sort_by = field;
		filter.sort_order = sortAsc ? 'asc' : 'desc';
		syncDslFromFilter();
	}

	function sortIcon(field: SortField): string {
		if (sortField !== field) return '';
		return sortAsc ? '\u2191' : '\u2193';
	}

	// ─── Autocomplete suggestions ──────────────────────────────────────

	interface Suggestion {
		label: string;
		insert: string;
		category: string;
		description?: string;
	}

	const suggestions = $derived.by((): Suggestion[] => {
		const input = dslInput;
		const cursorAtEnd = true; // We always work from end of input for simplicity

		// Find the last token being typed
		const lastSpace = input.lastIndexOf(' ');
		const currentToken = lastSpace >= 0 ? input.slice(lastSpace + 1) : input;

		if (!currentToken) {
			// Show syntax hints when empty or after a space
			if (!input.trim()) return [];
			return [];
		}

		const results: Suggestion[] = [];
		const colonIdx = currentToken.indexOf(':');

		if (colonIdx > 0) {
			// User typed "key:" — suggest values
			const key = currentToken.slice(0, colonIdx).toLowerCase();
			const valuePart = currentToken.slice(colonIdx + 1).toLowerCase();
			const prefix = input.slice(0, lastSpace >= 0 ? lastSpace + 1 : 0);

			if (key === 'model' && summary) {
				for (const m of summary.models_used) {
					if (!valuePart || m.toLowerCase().includes(valuePart)) {
						results.push({ label: m, insert: `${prefix}model:${m}`, category: 'model', description: 'Model' });
					}
				}
			} else if (key === 'provider' && summary) {
				for (const p of summary.providers_used) {
					if (!valuePart || p.toLowerCase().includes(valuePart)) {
						results.push({ label: p, insert: `${prefix}provider:${p}`, category: 'provider', description: 'Provider' });
					}
				}
			} else if (key === 'kind') {
				const kinds = [
					{ id: 'llm_call', label: 'LLM Call' },
					{ id: 'fs_read', label: 'File Read' },
					{ id: 'fs_write', label: 'File Write' },
					{ id: 'custom', label: 'Custom' }
				];
				for (const k of kinds) {
					if (!valuePart || k.id.includes(valuePart) || k.label.toLowerCase().includes(valuePart)) {
						results.push({ label: k.id, insert: `${prefix}kind:${k.id}`, category: 'kind', description: k.label });
					}
				}
			} else if (key === 'status') {
				const statuses = ['running', 'completed', 'failed'];
				for (const s of statuses) {
					if (!valuePart || s.includes(valuePart)) {
						results.push({ label: s, insert: `${prefix}status:${s}`, category: 'status' });
					}
				}
			} else if (key === 'since') {
				const presets = ['5m', '15m', '1h', '6h', '24h', '7d', '30d'];
				for (const p of presets) {
					if (!valuePart || p.includes(valuePart)) {
						results.push({ label: p, insert: `${prefix}since:${p}`, category: 'time' });
					}
				}
			} else if (key === 'duration') {
				const hints = ['>100ms', '>500ms', '>1s', '>5s', '>10s', '<100ms'];
				for (const h of hints) {
					if (!valuePart || h.includes(valuePart)) {
						results.push({ label: h, insert: `${prefix}duration:${h}`, category: 'duration' });
					}
				}
			} else if (key === 'tokens') {
				const hints = ['>100', '>500', '>1000', '>5000', '>10000'];
				for (const h of hints) {
					if (!valuePart || h.includes(valuePart)) {
						results.push({ label: h, insert: `${prefix}tokens:${h}`, category: 'tokens' });
					}
				}
			} else if (key === 'cost') {
				const hints = ['>0.001', '>0.01', '>0.05', '>0.10', '>1.00'];
				for (const h of hints) {
					if (!valuePart || h.includes(valuePart)) {
						results.push({ label: h, insert: `${prefix}cost:${h}`, category: 'cost' });
					}
				}
			} else if (key === 'sort') {
				const fields = ['duration', 'tokens', 'cost', 'started_at', 'name'];
				for (const f of fields) {
					if (!valuePart || f.includes(valuePart)) {
						results.push({ label: f, insert: `${prefix}sort:${f}`, category: 'sort' });
					}
				}
			}
		} else {
			// Suggest key prefixes
			const q = currentToken.toLowerCase();
			const prefix = input.slice(0, lastSpace >= 0 ? lastSpace + 1 : 0);
			const keys: Suggestion[] = [
				{ label: 'kind:', insert: `${prefix}kind:`, category: 'filter', description: 'Filter by span kind' },
				{ label: 'model:', insert: `${prefix}model:`, category: 'filter', description: 'Filter by LLM model' },
				{ label: 'provider:', insert: `${prefix}provider:`, category: 'filter', description: 'Filter by provider' },
				{ label: 'status:', insert: `${prefix}status:`, category: 'filter', description: 'running, completed, failed' },
				{ label: 'since:', insert: `${prefix}since:`, category: 'filter', description: 'Time range (e.g. 1h, 24h, 7d)' },
				{ label: 'duration:', insert: `${prefix}duration:`, category: 'filter', description: 'Duration filter (e.g. >500ms)' },
				{ label: 'tokens:', insert: `${prefix}tokens:`, category: 'filter', description: 'Token count (e.g. >1000)' },
				{ label: 'cost:', insert: `${prefix}cost:`, category: 'filter', description: 'Cost filter (e.g. >0.01)' },
				{ label: 'name:', insert: `${prefix}name:`, category: 'filter', description: 'Search span name' },
				{ label: 'trace:', insert: `${prefix}trace:`, category: 'filter', description: 'Filter by trace ID' },
				{ label: 'sort:', insert: `${prefix}sort:`, category: 'filter', description: 'Sort results' },
			];
			for (const k of keys) {
				if (k.label.startsWith(q) || k.description?.toLowerCase().includes(q)) {
					results.push(k);
				}
			}
		}

		return results.slice(0, 10);
	});

	function applySuggestion(s: Suggestion) {
		dslInput = s.insert;
		selectedSuggestionIdx = -1;
		// If the suggestion ends with ":", keep focus for value input
		if (s.insert.endsWith(':')) {
			searchInputEl?.focus();
		} else {
			// Add a space so they can keep typing
			dslInput = s.insert + ' ';
			searchInputEl?.focus();
		}
	}

	// ─── Active filter pills ───────────────────────────────────────────

	interface FilterPill {
		key: string;
		value: string;
		display: string;
		filterKey: keyof SpanFilter;
	}

	const activePills = $derived.by((): FilterPill[] => {
		const pills: FilterPill[] = [];
		const f = filter;

		if (f.kind) pills.push({ key: 'kind', value: f.kind, display: `kind: ${f.kind}`, filterKey: 'kind' });
		if (f.model) pills.push({ key: 'model', value: f.model, display: `model: ${f.model}`, filterKey: 'model' });
		if (f.provider) pills.push({ key: 'provider', value: f.provider, display: `provider: ${f.provider}`, filterKey: 'provider' });
		if (f.status) pills.push({ key: 'status', value: f.status, display: `status: ${f.status}`, filterKey: 'status' });
		if (f.since) pills.push({ key: 'since', value: f.since, display: `since: ${f.since}`, filterKey: 'since' });
		if (f.name_contains) pills.push({ key: 'name', value: f.name_contains, display: `name: ${f.name_contains}`, filterKey: 'name_contains' });
		if (f.trace_id) pills.push({ key: 'trace', value: f.trace_id, display: `trace: ${shortId(f.trace_id)}`, filterKey: 'trace_id' });
		if (f.duration_min) pills.push({ key: 'duration_min', value: f.duration_min, display: `duration > ${f.duration_min}ms`, filterKey: 'duration_min' });
		if (f.duration_max) pills.push({ key: 'duration_max', value: f.duration_max, display: `duration < ${f.duration_max}ms`, filterKey: 'duration_max' });
		if (f.tokens_min) pills.push({ key: 'tokens_min', value: f.tokens_min, display: `tokens > ${f.tokens_min}`, filterKey: 'tokens_min' });
		if (f.cost_min) pills.push({ key: 'cost_min', value: f.cost_min, display: `cost > $${f.cost_min}`, filterKey: 'cost_min' });

		return pills;
	});

	function removePill(pill: FilterPill) {
		delete filter[pill.filterKey];
		syncDslFromFilter();
	}

	function clearAllFilters() {
		filter = {};
		dslInput = '';
		syncDslFromFilter();
	}

	// ─── Quick filter presets ──────────────────────────────────────────

	interface Preset {
		label: string;
		dsl: string;
		icon: string;
	}

	const presets: Preset[] = [
		{ label: 'Slow LLM calls', dsl: 'kind:llm_call duration:>2s since:24h sort:duration', icon: 'slow' },
		{ label: 'Failed spans', dsl: 'status:failed since:24h', icon: 'error' },
		{ label: 'Expensive calls', dsl: 'kind:llm_call cost:>0.01 since:24h sort:cost', icon: 'cost' },
		{ label: 'High token usage', dsl: 'kind:llm_call tokens:>5000 since:24h sort:tokens', icon: 'tokens' },
		{ label: 'Recent LLM calls', dsl: 'kind:llm_call since:1h', icon: 'recent' },
		{ label: 'All spans (24h)', dsl: 'since:24h', icon: 'all' },
	];

	function applyPreset(p: Preset) {
		dslInput = p.dsl;
		applyDsl();
	}

	// ─── Grouped view ──────────────────────────────────────────────────

	interface TraceGroup {
		traceId: string;
		spans: Span[];
		totalDuration: number | null;
		totalTokens: number;
		totalCost: number;
		startedAt: string;
		status: string;
	}

	const groupedByTrace = $derived.by((): TraceGroup[] => {
		const map = new Map<string, Span[]>();
		for (const s of results) {
			let arr = map.get(s.trace_id);
			if (!arr) { arr = []; map.set(s.trace_id, arr); }
			arr.push(s);
		}
		const groups: TraceGroup[] = [];
		for (const [traceId, spans] of map) {
			const durations = spans.map(spanDurationMs).filter((d): d is number => d !== null);
			let totalTokens = 0;
			let totalCost = 0;
			for (const s of spans) {
				if (s.kind?.type === 'llm_call') {
					totalTokens += (s.kind.input_tokens ?? 0) + (s.kind.output_tokens ?? 0);
					totalCost += s.kind.cost ?? 0;
				}
			}
			const startedAt = spans.reduce((earliest, s) => {
				const t = spanStartedAt(s);
				return t < earliest ? t : earliest;
			}, spanStartedAt(spans[0]));
			const status = spans.some(s => spanStatus(s) === 'failed') ? 'failed'
				: spans.some(s => spanStatus(s) === 'running') ? 'running' : 'completed';
			groups.push({
				traceId,
				spans,
				totalDuration: durations.length ? Math.max(...durations) : null,
				totalTokens,
				totalCost,
				startedAt,
				status,
			});
		}
		// Sort by most recent
		groups.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
		return groups;
	});

	// ─── Scatter data ──────────────────────────────────────────────────

	const scatterData = $derived.by(() => {
		if (results.length === 0) return { points: [], xMin: 0, xMax: 1, yMax: 1 };
		const points = results.map(s => ({
			span: s,
			x: new Date(spanStartedAt(s)).getTime(),
			y: spanDurationMs(s) ?? 0,
			tokens: s.kind?.type === 'llm_call' ? ((s.kind.input_tokens ?? 0) + (s.kind.output_tokens ?? 0)) : 0,
			status: spanStatus(s),
		})).filter(p => p.y > 0);

		if (points.length === 0) return { points: [], xMin: 0, xMax: 1, yMax: 1 };

		const xMin = Math.min(...points.map(p => p.x));
		const xMax = Math.max(...points.map(p => p.x));
		const yMax = Math.max(...points.map(p => p.y));
		return { points, xMin, xMax: xMax === xMin ? xMin + 1 : xMax, yMax: yMax || 1 };
	});

	let scatterHovered: typeof scatterData.points[number] | null = $state(null);
	let scatterContainerEl: HTMLDivElement | undefined = $state(undefined);

	// ─── URL state ──────────────────────────────────────────────────────

	function writeUrlState() {
		const url = new URL(window.location.href);
		const dsl = dslInput.trim();
		if (dsl) url.searchParams.set('q', dsl);
		else url.searchParams.delete('q');
		if (viewMode !== 'table') url.searchParams.set('view', viewMode);
		else url.searchParams.delete('view');
		window.history.replaceState({}, '', url.toString());
	}

	function readUrlState(): { q: string | null; view: string | null } {
		const params = new URLSearchParams(window.location.search);
		return { q: params.get('q'), view: params.get('view') };
	}

	// ─── Lifecycle ──────────────────────────────────────────────────────

	onMount(() => {
		// Load history
		try {
			const stored = localStorage.getItem(HISTORY_KEY);
			if (stored) history = JSON.parse(stored);
		} catch { /* ignore */ }

		// Load analytics summary for suggestions
		getAnalyticsSummary().then(s => { summary = s; }).catch(() => {});

		// Restore from URL
		const state = readUrlState();
		if (state.view === 'grouped' || state.view === 'scatter') viewMode = state.view;
		if (state.q) {
			dslInput = state.q;
			applyDsl();
		}

		// Keyboard shortcut
		document.addEventListener('keydown', globalKeydown);
		return () => document.removeEventListener('keydown', globalKeydown);
	});

	function globalKeydown(e: KeyboardEvent) {
		if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
			e.preventDefault();
			searchInputEl?.focus();
		}
	}

	// ─── Query execution ────────────────────────────────────────────────

	async function runQuery() {
		loading = true;
		hasQueried = true;
		writeUrlState();
		const start = performance.now();
		try {
			const resolved: SpanFilter = { ...filter };
			if (resolved.since) {
				const iso = parseRelativeTime(resolved.since);
				if (iso) resolved.since = iso;
			}
			if (resolved.until) {
				const iso = parseRelativeTime(resolved.until);
				if (iso) resolved.until = iso;
			}
			const res = await getSpans(resolved);
			results = res.spans;
			resultCount = res.count;
			queryTimeMs = Math.round(performance.now() - start);
			pushHistory(dslInput, resultCount);
		} catch {
			results = [];
			resultCount = 0;
			queryTimeMs = Math.round(performance.now() - start);
		} finally {
			loading = false;
		}
	}

	function applyDsl() {
		filter = parseDsl(dslInput);
		if (filter.sort_by) {
			sortField = filter.sort_by as SortField;
			sortAsc = filter.sort_order === 'asc';
		}
		runQuery();
	}

	function syncDslFromFilter() {
		dslInput = filterToDsl(filter);
		runQuery();
	}

	// ─── Keyboard nav in search ────────────────────────────────────────

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			if (selectedSuggestionIdx >= 0 && selectedSuggestionIdx < suggestions.length) {
				e.preventDefault();
				applySuggestion(suggestions[selectedSuggestionIdx]);
			} else {
				applyDsl();
				searchFocused = false;
			}
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedSuggestionIdx = Math.min(selectedSuggestionIdx + 1, suggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedSuggestionIdx = Math.max(selectedSuggestionIdx - 1, -1);
		} else if (e.key === 'Escape') {
			searchFocused = false;
			searchInputEl?.blur();
		} else {
			selectedSuggestionIdx = -1;
		}
	}

	// ─── History ────────────────────────────────────────────────────────

	function pushHistory(dsl: string, count: number) {
		if (!dsl.trim()) return;
		const existing = history.findIndex((h) => h.dsl === dsl);
		if (existing >= 0) {
			history[existing] = { dsl, timestamp: Date.now(), resultCount: count };
			const item = history.splice(existing, 1)[0];
			history.unshift(item);
		} else {
			history.unshift({ dsl, timestamp: Date.now(), resultCount: count });
		}
		if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
		try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* ignore */ }
	}

	function loadHistory(entry: HistoryEntry) {
		dslInput = entry.dsl;
		applyDsl();
	}

	function clearHistory() {
		history = [];
		try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
	}

	// ─── Formatting helpers ─────────────────────────────────────────────

	function formatDuration(ms: number | null): string {
		if (ms === null) return '-';
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}

	function formatTime(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	}

	function formatDateTime(iso: string): string {
		const d = new Date(iso);
		const now = new Date();
		const isToday = d.toDateString() === now.toDateString();
		if (isToday) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
			d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	function formatTokens(span: Span): string {
		const k = span.kind;
		if (!k || k.type !== 'llm_call') return '-';
		const total = (k.input_tokens ?? 0) + (k.output_tokens ?? 0);
		if (total === 0) return '-';
		return `${total.toLocaleString()}`;
	}

	function formatCost(span: Span): string {
		const k = span.kind;
		if (!k || k.type !== 'llm_call') return '-';
		const cost = k.cost;
		if (cost === undefined || cost === null || cost === 0) return '-';
		if (cost < 0.001) return `$${cost.toFixed(6)}`;
		if (cost < 0.01) return `$${cost.toFixed(4)}`;
		return `$${cost.toFixed(3)}`;
	}

	function formatCostNum(n: number): string {
		if (n === 0) return '-';
		if (n < 0.001) return `$${n.toFixed(6)}`;
		if (n < 0.01) return `$${n.toFixed(4)}`;
		return `$${n.toFixed(3)}`;
	}

	function timeAgo(ts: number): string {
		const diff = Date.now() - ts;
		if (diff < 60_000) return 'just now';
		if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
		if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
		return `${Math.floor(diff / 86_400_000)}d ago`;
	}

	function exportResults() {
		if (results.length === 0) return;
		const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `query-results-${resultCount}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function copyShareUrl() {
		writeUrlState();
		navigator.clipboard.writeText(window.location.href);
	}
</script>

<svelte:head>
	<title>Query | Traceway</title>
</svelte:head>

<div class="h-[calc(100vh-5rem)] flex flex-col gap-0">
	<!-- Search bar area -->
	<div class="shrink-0 px-5 pt-4 pb-3 space-y-3">
		<!-- Search input -->
		<div class="relative">
			<div class="flex items-center bg-bg-secondary border border-border rounded-lg transition-colors focus-within:border-accent/50">
				<div class="pl-3 pr-2 text-text-muted">
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
					</svg>
				</div>
				<input
					bind:this={searchInputEl}
					bind:value={dslInput}
					onfocus={() => { searchFocused = true; selectedSuggestionIdx = -1; }}
					onblur={() => setTimeout(() => searchFocused = false, 150)}
					onkeydown={handleKeydown}
					type="text"
					placeholder="Search spans... kind:llm_call model:gpt-4 since:1h  (press / to focus)"
					class="flex-1 bg-transparent py-2.5 text-sm font-mono text-text placeholder:text-text-muted/40 focus:outline-none"
				/>
				{#if dslInput}
					<button
						class="px-2 text-text-muted hover:text-text transition-colors"
						onclick={() => { dslInput = ''; filter = {}; searchInputEl?.focus(); }}
						aria-label="Clear search"
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
				<button
					onclick={applyDsl}
					disabled={loading}
					class="px-4 py-2 m-1 bg-accent text-bg rounded-md text-xs font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
				>
					{loading ? '...' : 'Run'}
				</button>
			</div>

			<!-- Autocomplete dropdown -->
			{#if searchFocused && suggestions.length > 0}
				<div class="absolute left-0 right-0 top-full mt-1 z-30 bg-bg-secondary border border-border rounded-lg shadow-xl overflow-hidden">
					{#each suggestions as s, i}
						<button
							class="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors
								{i === selectedSuggestionIdx ? 'bg-accent/10' : 'hover:bg-bg-tertiary'}"
							onmousedown={() => applySuggestion(s)}
							onmouseenter={() => selectedSuggestionIdx = i}
						>
							<span class="text-[10px] uppercase tracking-wider text-text-muted/50 w-14 shrink-0 text-right">{s.category}</span>
							<span class="text-sm font-mono text-text">{s.label}</span>
							{#if s.description}
								<span class="text-xs text-text-muted ml-auto">{s.description}</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}

			<!-- History dropdown (shown when focused with empty input) -->
			{#if searchFocused && !dslInput.trim() && history.length > 0 && suggestions.length === 0}
				<div class="absolute left-0 right-0 top-full mt-1 z-30 bg-bg-secondary border border-border rounded-lg shadow-xl overflow-hidden">
					<div class="px-3 py-1.5 border-b border-border flex items-center justify-between">
						<span class="text-[10px] uppercase tracking-wider text-text-muted">Recent queries</span>
						<button class="text-[10px] text-text-muted hover:text-danger transition-colors" onmousedown={clearHistory}>clear</button>
					</div>
					{#each history.slice(0, 8) as entry}
						<button
							class="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-bg-tertiary transition-colors"
							onmousedown={() => loadHistory(entry)}
						>
							<span class="text-xs font-mono text-text truncate">{entry.dsl}</span>
							<span class="text-[10px] text-text-muted shrink-0 ml-3">{entry.resultCount} results &middot; {timeAgo(entry.timestamp)}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Active filter pills + controls row -->
		<div class="flex items-center gap-2 flex-wrap min-h-[28px]">
			{#if activePills.length > 0}
				{#each activePills as pill}
					<button
						onclick={() => removePill(pill)}
						class="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 border border-accent/20 rounded text-xs text-accent hover:bg-accent/20 transition-colors group"
					>
						<span class="font-mono">{pill.display}</span>
						<svg class="w-3 h-3 text-accent/50 group-hover:text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
						</svg>
					</button>
				{/each}
				<button onclick={clearAllFilters} class="text-[10px] text-text-muted hover:text-text transition-colors ml-1">Clear all</button>
			{:else if !hasQueried}
				<!-- Quick filter presets -->
				{#each presets as preset}
					<button
						onclick={() => applyPreset(preset)}
						class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-bg-secondary border border-border rounded-md text-xs text-text-secondary hover:text-text hover:border-accent/30 transition-colors"
					>
						{#if preset.icon === 'slow'}
							<svg class="w-3 h-3 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
						{:else if preset.icon === 'error'}
							<svg class="w-3 h-3 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
						{:else if preset.icon === 'cost'}
							<svg class="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
						{:else if preset.icon === 'tokens'}
							<svg class="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
						{:else}
							<svg class="w-3 h-3 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
						{/if}
						{preset.label}
					</button>
				{/each}
			{/if}

			<div class="flex-1"></div>

			{#if hasQueried}
				<!-- Results meta + view mode + actions -->
				<div class="flex items-center gap-3 text-xs text-text-muted shrink-0">
					<span>{resultCount.toLocaleString()} span{resultCount !== 1 ? 's' : ''} &middot; {queryTimeMs}ms</span>

					<!-- View mode toggle -->
					<div class="flex items-center bg-bg-tertiary rounded text-[10px]">
						<button
							class="px-2 py-1 rounded transition-colors {viewMode === 'table' ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text'}"
							onclick={() => { viewMode = 'table'; writeUrlState(); }}
							title="Table view"
						>
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v.75" /></svg>
						</button>
						<button
							class="px-2 py-1 rounded transition-colors {viewMode === 'grouped' ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text'}"
							onclick={() => { viewMode = 'grouped'; writeUrlState(); }}
							title="Grouped by trace"
						>
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z" /></svg>
						</button>
						<button
							class="px-2 py-1 rounded transition-colors {viewMode === 'scatter' ? 'bg-accent/20 text-accent' : 'text-text-muted hover:text-text'}"
							onclick={() => { viewMode = 'scatter'; writeUrlState(); }}
							title="Duration scatter plot"
						>
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
						</button>
					</div>

					<button
						onclick={copyShareUrl}
						class="hover:text-accent transition-colors"
						title="Copy shareable URL"
					>
						<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.343 8.28" />
						</svg>
					</button>

					{#if results.length > 0}
						<button
							onclick={exportResults}
							class="hover:text-text transition-colors"
							title="Export results as JSON"
						>
							<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
							</svg>
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Results area -->
	<div class="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
		{#if hasQueried}
			{#if results.length === 0 && !loading}
				<div class="flex flex-col items-center justify-center h-64 text-text-muted">
					<svg class="w-10 h-10 mb-3 text-text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
					</svg>
					<p class="text-sm">No spans match your query</p>
					<p class="text-xs text-text-muted/60 mt-1">Try broadening your filters or changing the time range</p>
				</div>

			{:else if viewMode === 'table'}
				<!-- Table view -->
				<div class="border border-border rounded-lg overflow-hidden">
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="text-left text-[11px] text-text-muted border-b border-border bg-bg-secondary/50 uppercase tracking-wider">
									<th class="px-3 py-2 font-medium cursor-pointer hover:text-text select-none" onclick={() => toggleSort('name')}>
										Name <span class="text-accent">{sortIcon('name')}</span>
									</th>
									<th class="px-3 py-2 font-medium cursor-pointer hover:text-text select-none" onclick={() => toggleSort('kind')}>
										Kind <span class="text-accent">{sortIcon('kind')}</span>
									</th>
									<th class="px-3 py-2 font-medium cursor-pointer hover:text-text select-none" onclick={() => toggleSort('model')}>
										Model <span class="text-accent">{sortIcon('model')}</span>
									</th>
									<th class="px-3 py-2 font-medium cursor-pointer hover:text-text select-none" onclick={() => toggleSort('status')}>
										Status <span class="text-accent">{sortIcon('status')}</span>
									</th>
									<th class="px-3 py-2 font-medium">Trace</th>
									<th class="px-3 py-2 font-medium text-right cursor-pointer hover:text-text select-none" onclick={() => toggleSort('tokens')}>
										<span class="text-accent">{sortIcon('tokens')}</span> Tokens
									</th>
									<th class="px-3 py-2 font-medium text-right cursor-pointer hover:text-text select-none" onclick={() => toggleSort('cost')}>
										<span class="text-accent">{sortIcon('cost')}</span> Cost
									</th>
									<th class="px-3 py-2 font-medium text-right cursor-pointer hover:text-text select-none" onclick={() => toggleSort('duration')}>
										<span class="text-accent">{sortIcon('duration')}</span> Duration
									</th>
									<th class="px-3 py-2 font-medium text-right cursor-pointer hover:text-text select-none" onclick={() => toggleSort('started_at')}>
										<span class="text-accent">{sortIcon('started_at')}</span> Time
									</th>
								</tr>
							</thead>
							<tbody>
								{#each results as span}
									<tr
										class="border-b border-border/30 hover:bg-bg-secondary/50 cursor-pointer transition-colors"
										onclick={() => goto(`/traces/${span.trace_id}`)}
									>
										<td class="px-3 py-1.5 font-mono text-xs text-text truncate max-w-[200px]">{span.name}</td>
										<td class="px-3 py-1.5">
											{#if span.kind}
												<span class="inline-flex items-center gap-1">
													<SpanKindIcon {span} />
													<span class="text-[11px] text-text-muted">{spanKindLabel(span)}</span>
												</span>
											{:else}
												<span class="text-text-muted">-</span>
											{/if}
										</td>
										<td class="px-3 py-1.5 text-text-secondary font-mono text-xs">{span.kind?.type === 'llm_call' ? span.kind.model : '-'}</td>
										<td class="px-3 py-1.5">
											<StatusBadge status={spanStatus(span)} />
										</td>
										<td class="px-3 py-1.5 font-mono text-xs text-accent">{shortId(span.trace_id)}</td>
										<td class="px-3 py-1.5 text-right text-text-secondary font-mono text-xs tabular-nums">{formatTokens(span)}</td>
										<td class="px-3 py-1.5 text-right text-text-secondary font-mono text-xs tabular-nums">{formatCost(span)}</td>
										<td class="px-3 py-1.5 text-right text-text-secondary font-mono text-xs tabular-nums">{formatDuration(spanDurationMs(span))}</td>
										<td class="px-3 py-1.5 text-right text-text-muted text-xs tabular-nums">{formatTime(spanStartedAt(span))}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>

			{:else if viewMode === 'grouped'}
				<!-- Grouped by trace view -->
				<div class="space-y-3">
					{#each groupedByTrace as group}
						<div class="border border-border rounded-lg overflow-hidden">
							<!-- Trace header -->
							<button
								onclick={() => goto(`/traces/${group.traceId}`)}
								class="w-full flex items-center gap-3 px-4 py-2.5 bg-bg-secondary hover:bg-bg-tertiary transition-colors text-left"
							>
								<span class="w-2 h-2 rounded-full shrink-0
									{group.status === 'failed' ? 'bg-danger' : group.status === 'running' ? 'bg-warning animate-pulse' : 'bg-success'}"></span>
								<span class="font-mono text-xs text-accent">{shortId(group.traceId)}</span>
								<span class="text-xs text-text-muted">{group.spans.length} span{group.spans.length !== 1 ? 's' : ''}</span>

								<div class="flex-1"></div>

								<div class="flex items-center gap-3 text-xs font-mono text-text-secondary">
									{#if group.totalTokens > 0}
										<span>{group.totalTokens.toLocaleString()} tok</span>
									{/if}
									{#if group.totalCost > 0}
										<span class="text-success">{formatCostNum(group.totalCost)}</span>
									{/if}
									{#if group.totalDuration !== null}
										<span>{formatDuration(group.totalDuration)}</span>
									{/if}
									<span class="text-text-muted">{formatDateTime(group.startedAt)}</span>
								</div>
							</button>

							<!-- Span rows -->
							<div>
								{#each group.spans as span}
									<button
										onclick={() => goto(`/traces/${span.trace_id}`)}
										class="w-full flex items-center gap-2 px-4 py-1.5 border-t border-border/30 hover:bg-bg-secondary/30 transition-colors text-left"
									>
										<div class="w-4 shrink-0">
											<SpanKindIcon {span} />
										</div>
										<span class="text-xs text-text truncate flex-1 font-mono">{span.name}</span>
										{#if span.kind?.type === 'llm_call' && span.kind.model}
											<span class="text-[10px] text-purple-400 bg-purple-400/10 rounded px-1 py-px shrink-0">{span.kind.model}</span>
										{/if}
										<StatusBadge status={spanStatus(span)} />
										<span class="text-xs text-text-secondary font-mono tabular-nums w-16 text-right shrink-0">{formatDuration(spanDurationMs(span))}</span>
									</button>
								{/each}
							</div>
						</div>
					{/each}
				</div>

			{:else if viewMode === 'scatter'}
				<!-- Scatter plot: time vs duration -->
				<div class="border border-border rounded-lg overflow-hidden bg-bg-secondary">
					<div class="px-4 py-2 border-b border-border flex items-center justify-between">
						<span class="text-xs text-text-muted uppercase tracking-wider">Duration over time</span>
						<span class="text-[10px] text-text-muted">Bubble size = token count &middot; Click to view trace</span>
					</div>

					{#if scatterData.points.length === 0}
						<div class="flex items-center justify-center h-64 text-text-muted text-sm">
							No spans with measurable duration
						</div>
					{:else}
						<div
							bind:this={scatterContainerEl}
							class="relative h-80 mx-4 my-4"
						>
							<!-- Y axis labels -->
							<div class="absolute left-0 top-0 bottom-6 w-14 flex flex-col justify-between text-[10px] text-text-muted font-mono text-right pr-2">
								<span>{formatDuration(scatterData.yMax)}</span>
								<span>{formatDuration(scatterData.yMax / 2)}</span>
								<span>0</span>
							</div>

							<!-- Plot area -->
							<div class="absolute left-16 right-0 top-0 bottom-6 border-l border-b border-border/50">
								<!-- Grid lines -->
								<div class="absolute inset-0">
									<div class="absolute left-0 right-0 top-1/4 border-t border-border/20"></div>
									<div class="absolute left-0 right-0 top-1/2 border-t border-border/20"></div>
									<div class="absolute left-0 right-0 top-3/4 border-t border-border/20"></div>
								</div>

								<!-- Points -->
								{#each scatterData.points as point}
									{@const xPct = ((point.x - scatterData.xMin) / (scatterData.xMax - scatterData.xMin)) * 100}
									{@const yPct = (1 - point.y / scatterData.yMax) * 100}
									{@const size = Math.max(6, Math.min(24, Math.sqrt(point.tokens / 10) + 4))}
									<button
										class="absolute rounded-full transition-all hover:ring-2 hover:ring-accent/50
											{point.status === 'failed' ? 'bg-danger/70' : point.status === 'running' ? 'bg-warning/70' : 'bg-accent/60'}"
										style="left: {xPct}%; top: {yPct}%; width: {size}px; height: {size}px; transform: translate(-50%, -50%)"
										onclick={() => goto(`/traces/${point.span.trace_id}`)}
										onmouseenter={() => scatterHovered = point}
										onmouseleave={() => scatterHovered = null}
									></button>
								{/each}

								<!-- Hover tooltip -->
								{#if scatterHovered}
									{@const xPct = ((scatterHovered.x - scatterData.xMin) / (scatterData.xMax - scatterData.xMin)) * 100}
									{@const yPct = (1 - scatterHovered.y / scatterData.yMax) * 100}
									<div
										class="absolute z-10 bg-bg-tertiary border border-border rounded-lg px-3 py-2 shadow-lg pointer-events-none text-xs space-y-0.5 min-w-[180px]"
										style="left: {Math.min(xPct, 75)}%; top: {Math.max(yPct - 10, 5)}%; transform: translateX(-50%)"
									>
										<div class="font-mono text-text font-medium truncate">{scatterHovered.span.name}</div>
										<div class="flex items-center gap-2 text-text-muted">
											<span>{formatDuration(scatterHovered.y)}</span>
											{#if scatterHovered.tokens > 0}
												<span>&middot; {scatterHovered.tokens.toLocaleString()} tok</span>
											{/if}
										</div>
										{#if scatterHovered.span.kind?.type === 'llm_call'}
											<div class="text-purple-400">{scatterHovered.span.kind.model}</div>
										{/if}
										<div class="text-text-muted/60">{formatDateTime(spanStartedAt(scatterHovered.span))}</div>
									</div>
								{/if}
							</div>

							<!-- X axis labels -->
							<div class="absolute left-16 right-0 bottom-0 h-5 flex justify-between text-[10px] text-text-muted font-mono">
								<span>{formatDateTime(new Date(scatterData.xMin).toISOString())}</span>
								<span>{formatDateTime(new Date(scatterData.xMax).toISOString())}</span>
							</div>
						</div>
					{/if}
				</div>

				<!-- Still show the table below scatter for detail -->
				{#if scatterData.points.length > 0}
					<div class="mt-3 border border-border rounded-lg overflow-hidden">
						<table class="w-full text-sm">
							<thead>
								<tr class="text-left text-[11px] text-text-muted border-b border-border bg-bg-secondary/50 uppercase tracking-wider">
									<th class="px-3 py-2 font-medium">Name</th>
									<th class="px-3 py-2 font-medium">Model</th>
									<th class="px-3 py-2 font-medium">Status</th>
									<th class="px-3 py-2 font-medium text-right">Tokens</th>
									<th class="px-3 py-2 font-medium text-right">Cost</th>
									<th class="px-3 py-2 font-medium text-right">Duration</th>
									<th class="px-3 py-2 font-medium text-right">Time</th>
								</tr>
							</thead>
							<tbody>
								{#each results as span}
									<tr
										class="border-b border-border/30 hover:bg-bg-secondary/50 cursor-pointer transition-colors"
										onclick={() => goto(`/traces/${span.trace_id}`)}
									>
										<td class="px-3 py-1.5 font-mono text-xs text-text truncate max-w-[200px]">{span.name}</td>
										<td class="px-3 py-1.5 text-text-secondary font-mono text-xs">{span.kind?.type === 'llm_call' ? span.kind.model : '-'}</td>
										<td class="px-3 py-1.5"><StatusBadge status={spanStatus(span)} /></td>
										<td class="px-3 py-1.5 text-right text-text-secondary font-mono text-xs tabular-nums">{formatTokens(span)}</td>
										<td class="px-3 py-1.5 text-right text-text-secondary font-mono text-xs tabular-nums">{formatCost(span)}</td>
										<td class="px-3 py-1.5 text-right text-text-secondary font-mono text-xs tabular-nums">{formatDuration(spanDurationMs(span))}</td>
										<td class="px-3 py-1.5 text-right text-text-muted text-xs tabular-nums">{formatTime(spanStartedAt(span))}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{/if}

		{:else}
			<!-- Empty state -->
			<div class="flex flex-col items-center justify-center h-full max-h-96 text-center">
				<div class="w-16 h-16 rounded-full bg-bg-secondary flex items-center justify-center mb-4">
					<svg class="w-7 h-7 text-text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
					</svg>
				</div>
				<h2 class="text-sm font-medium text-text mb-1">Query your spans</h2>
				<p class="text-xs text-text-muted mb-4 max-w-sm">
					Search across all traces to find specific LLM calls, debug errors, or analyze costs.
					Use the search bar above or click a preset to get started.
				</p>
				<div class="flex flex-col gap-1 text-xs text-text-muted/60 font-mono">
					<span>kind:llm_call model:gpt-4 since:1h</span>
					<span>status:failed duration:>500ms</span>
					<span>tokens:>1000 cost:>0.01 sort:cost</span>
				</div>
			</div>
		{/if}
	</div>
</div>
