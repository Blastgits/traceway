<script lang="ts">
	import {
		getDatasets,
		createDataset,
		deleteDataset,
		subscribeEvents,
		shortId,
		listEvalRuns,
		type DatasetWithCount,
		type EvalRun
	} from '$lib/api';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	// ─── Core state ──────────────────────────────────────────────────────
	let datasets: DatasetWithCount[] = $state([]);
	let loading = $state(true);

	// ─── New dataset form ────────────────────────────────────────────────
	let showForm = $state(false);
	let newName = $state('');
	let newDescription = $state('');
	let creating = $state(false);

	// ─── Search & filters ────────────────────────────────────────────────
	let datasetSearch = $state('');
	let filterMenuOpen = $state(false);
	let filterMode: 'all' | 'nonempty' | 'empty' = $state('all');
	let timeRange: 'all' | '7d' | '30d' = $state('all');

	// ─── Column visibility (defaults; localStorage read in onMount) ─────
	let showIdCol = $state(true);
	let showCreatedCol = $state(true);
	let showCountCol = $state(true);
	let showUpdatedCol = $state(true);
	let showEvalCol = $state(true);
	let showCreatedByCol = $state(false);
	let displayMenuOpen = $state(false);

	// ─── Sort state ──────────────────────────────────────────────────────
	type SortField = 'name' | 'datapoints' | 'created' | 'updated' | 'eval';
	type SortDir = 'asc' | 'desc' | null;
	let sortField: SortField | null = $state(null);
	let sortDir: SortDir = $state(null);

	// ─── Selection & bulk actions ────────────────────────────────────────
	let selectedIds: Set<string> = $state(new Set());
	let confirmDeleteBulk = $state(false);
	let bulkDeleting = $state(false);

	// ─── Eval score cache ────────────────────────────────────────────────
	let evalScores: Map<string, number | null> = $state(new Map());
	let evalLoading: Set<string> = $state(new Set());

	// ─── localStorage persistence via $effect ────────────────────────────
	let mounted = $state(false);

	$effect(() => {
		if (!mounted) return;
		try { localStorage.setItem('ds-col-id', JSON.stringify(showIdCol)); } catch { /* noop */ }
	});
	$effect(() => {
		if (!mounted) return;
		try { localStorage.setItem('ds-col-created', JSON.stringify(showCreatedCol)); } catch { /* noop */ }
	});
	$effect(() => {
		if (!mounted) return;
		try { localStorage.setItem('ds-col-count', JSON.stringify(showCountCol)); } catch { /* noop */ }
	});
	$effect(() => {
		if (!mounted) return;
		try { localStorage.setItem('ds-col-updated', JSON.stringify(showUpdatedCol)); } catch { /* noop */ }
	});
	$effect(() => {
		if (!mounted) return;
		try { localStorage.setItem('ds-col-eval', JSON.stringify(showEvalCol)); } catch { /* noop */ }
	});
	$effect(() => {
		if (!mounted) return;
		try { localStorage.setItem('ds-col-createdby', JSON.stringify(showCreatedByCol)); } catch { /* noop */ }
	});
	$effect(() => {
		if (!mounted) return;
		try { localStorage.setItem('ds-sort-field', JSON.stringify(sortField)); } catch { /* noop */ }
	});
	$effect(() => {
		if (!mounted) return;
		try { localStorage.setItem('ds-sort-dir', JSON.stringify(sortDir)); } catch { /* noop */ }
	});

	// ─── Data loading ────────────────────────────────────────────────────

	async function load() {
		try {
			const result = await getDatasets();
			datasets = result.datasets;
			fetchEvalScores(datasets);
		} catch {
			// API not available
		}
		loading = false;
	}

	async function fetchEvalScores(dsList: DatasetWithCount[]) {
		for (const ds of dsList) {
			if (evalScores.has(ds.id) || evalLoading.has(ds.id)) continue;
			evalLoading = new Set([...evalLoading, ds.id]);
			try {
				const page = await listEvalRuns(ds.id);
				const runs = page.items ?? [];
				if (runs.length > 0) {
					// Sort by created_at descending to get latest
					const sorted = [...runs].sort(
						(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
					);
					const latestScore = sorted[0].results?.scores?.mean ?? null;
					evalScores = new Map([...evalScores, [ds.id, latestScore]]);
				} else {
					evalScores = new Map([...evalScores, [ds.id, null]]);
				}
			} catch {
				evalScores = new Map([...evalScores, [ds.id, null]]);
			}
			const next = new Set(evalLoading);
			next.delete(ds.id);
			evalLoading = next;
		}
	}

	onMount(() => {
		// Read localStorage for column visibility
		try {
			const id = localStorage.getItem('ds-col-id');
			if (id !== null) showIdCol = JSON.parse(id);
			const created = localStorage.getItem('ds-col-created');
			if (created !== null) showCreatedCol = JSON.parse(created);
			const count = localStorage.getItem('ds-col-count');
			if (count !== null) showCountCol = JSON.parse(count);
			const updated = localStorage.getItem('ds-col-updated');
			if (updated !== null) showUpdatedCol = JSON.parse(updated);
			const evalCol = localStorage.getItem('ds-col-eval');
			if (evalCol !== null) showEvalCol = JSON.parse(evalCol);
			const createdBy = localStorage.getItem('ds-col-createdby');
			if (createdBy !== null) showCreatedByCol = JSON.parse(createdBy);
			const sf = localStorage.getItem('ds-sort-field');
			if (sf !== null) sortField = JSON.parse(sf);
			const sd = localStorage.getItem('ds-sort-dir');
			if (sd !== null) sortDir = JSON.parse(sd);
		} catch {
			// ignore parse errors
		}

		mounted = true;
		load();

		const unsub = subscribeEvents((event) => {
			if (event.type === 'dataset_created') {
				const newDs: DatasetWithCount = { ...event.dataset, datapoint_count: 0 };
				datasets = [newDs, ...datasets];
				fetchEvalScores([newDs]);
			} else if (event.type === 'dataset_deleted') {
				datasets = datasets.filter((d) => d.id !== event.dataset_id);
				const next = new Set(selectedIds);
				next.delete(event.dataset_id);
				selectedIds = next;
			} else if (event.type === 'cleared') {
				datasets = [];
				selectedIds = new Set();
			}
		});

		return unsub;
	});

	// ─── Handlers ────────────────────────────────────────────────────────

	async function handleCreate() {
		if (!newName.trim()) return;
		creating = true;
		try {
			const ds = await createDataset(newName.trim(), newDescription.trim() || undefined);
			const newDs: DatasetWithCount = { ...ds, datapoint_count: 0 };
			datasets = [newDs, ...datasets];
			fetchEvalScores([newDs]);
			newName = '';
			newDescription = '';
			showForm = false;
		} catch {
			// error
		}
		creating = false;
	}

	async function handleDelete(e: Event, id: string) {
		e.stopPropagation();
		try {
			await deleteDataset(id);
			datasets = datasets.filter((d) => d.id !== id);
			const next = new Set(selectedIds);
			next.delete(id);
			selectedIds = next;
		} catch {
			// error
		}
	}

	async function handleBulkDelete() {
		if (!confirmDeleteBulk) {
			confirmDeleteBulk = true;
			return;
		}
		bulkDeleting = true;
		const ids = [...selectedIds];
		for (const id of ids) {
			try {
				await deleteDataset(id);
				datasets = datasets.filter((d) => d.id !== id);
			} catch {
				// continue deleting others
			}
		}
		selectedIds = new Set();
		confirmDeleteBulk = false;
		bulkDeleting = false;
	}

	function handleBulkExport() {
		const selected = datasets.filter((d) => selectedIds.has(d.id));
		const payload = selected.map((d) => ({
			id: d.id,
			name: d.name,
			description: d.description,
			created_at: d.created_at,
			datapoint_count: d.datapoint_count
		}));
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `datasets-export-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function toggleSelection(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedIds = next;
		confirmDeleteBulk = false;
	}

	function toggleSelectAll() {
		if (allSelected) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(visibleDatasets.map((d) => d.id));
		}
		confirmDeleteBulk = false;
	}

	function toggleSort(field: SortField) {
		if (sortField === field) {
			if (sortDir === 'asc') {
				sortDir = 'desc';
			} else if (sortDir === 'desc') {
				sortField = null;
				sortDir = null;
			} else {
				sortDir = 'asc';
			}
		} else {
			sortField = field;
			sortDir = 'asc';
		}
	}

	function sortIndicator(field: SortField): string {
		if (sortField !== field) return '';
		if (sortDir === 'asc') return ' \u25B2';
		if (sortDir === 'desc') return ' \u25BC';
		return '';
	}

	// ─── Formatting ──────────────────────────────────────────────────────

	function formatDate(iso: string | undefined | null): string {
		if (!iso) return '\u2014';
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatScore(score: number | null | undefined): string {
		if (score == null) return '\u2014';
		return (score * 100).toFixed(1) + '%';
	}

	// ─── Time range filter ───────────────────────────────────────────────

	function isInTimeRange(iso: string | undefined | null): boolean {
		if (timeRange === 'all') return true;
		if (!iso) return false;
		const now = Date.now();
		const ts = new Date(iso).getTime();
		if (timeRange === '7d') return now - ts <= 7 * 24 * 60 * 60 * 1000;
		if (timeRange === '30d') return now - ts <= 30 * 24 * 60 * 60 * 1000;
		return true;
	}

	// ─── Derived data ────────────────────────────────────────────────────

	const visibleDatasets = $derived.by(() => {
		const q = datasetSearch.trim().toLowerCase();
		let filtered = datasets.filter((ds) => {
			if (filterMode === 'nonempty' && ds.datapoint_count === 0) return false;
			if (filterMode === 'empty' && ds.datapoint_count > 0) return false;
			if (!isInTimeRange(ds.created_at)) return false;
			if (!q) return true;
			return (
				ds.name.toLowerCase().includes(q) ||
				(ds.description ?? '').toLowerCase().includes(q) ||
				ds.id.toLowerCase().includes(q)
			);
		});

		// Sort
		if (sortField && sortDir) {
			const dir = sortDir === 'asc' ? 1 : -1;
			filtered = [...filtered].sort((a, b) => {
				switch (sortField) {
					case 'name':
						return dir * a.name.localeCompare(b.name);
					case 'datapoints':
						return dir * (a.datapoint_count - b.datapoint_count);
					case 'created':
						return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
					case 'updated': {
						const aTime = (a as any).updated_at ? new Date((a as any).updated_at).getTime() : 0;
						const bTime = (b as any).updated_at ? new Date((b as any).updated_at).getTime() : 0;
						return dir * (aTime - bTime);
					}
					case 'eval': {
						const aScore = evalScores.get(a.id) ?? -1;
						const bScore = evalScores.get(b.id) ?? -1;
						return dir * (aScore - bScore);
					}
					default:
						return 0;
				}
			});
		}

		return filtered;
	});

	const allSelected = $derived(
		visibleDatasets.length > 0 && visibleDatasets.every((d) => selectedIds.has(d.id))
	);

	const selectionCount = $derived(selectedIds.size);

	const totalDatapoints = $derived(
		datasets.reduce((sum, ds) => sum + ds.datapoint_count, 0)
	);
</script>

<div class="app-shell-wide space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-semibold tracking-tight">Datasets</h1>
		<button class="btn-primary" onclick={() => (showForm = !showForm)}>
			{showForm ? 'Cancel' : '+ New Dataset'}
		</button>
	</div>

	<!-- Inline create form -->
	{#if showForm}
		<form
			class="table-float p-4 space-y-3"
			onsubmit={(e) => {
				e.preventDefault();
				handleCreate();
			}}
		>
			<div>
				<label for="ds-name" class="label-micro block uppercase mb-1">Name</label>
				<input
					id="ds-name"
					type="text"
					bind:value={newName}
					placeholder="e.g. eval-gpt4-coding"
					class="control-input"
				/>
			</div>
			<div>
				<label for="ds-desc" class="label-micro block uppercase mb-1">Description (optional)</label>
				<input
					id="ds-desc"
					type="text"
					bind:value={newDescription}
					placeholder="What is this dataset for?"
					class="control-input"
				/>
			</div>
			<button type="submit" disabled={creating || !newName.trim()} class="btn-primary disabled:opacity-50">
				{creating ? 'Creating...' : 'Create Dataset'}
			</button>
		</form>
	{/if}

	<!-- Main table container -->
	<div class="table-float p-2 space-y-2 motion-rise-in">
		<!-- Toolbar row -->
		<div class="flex items-center gap-1.5 flex-wrap">
			<!-- Filter dropdown -->
			<div class="relative">
				<button
					class="btn-secondary h-7 text-[12px] motion-interactive"
					onclick={() => {
						filterMenuOpen = !filterMenuOpen;
						displayMenuOpen = false;
					}}
				>
					+ Add filter
				</button>
				{#if filterMenuOpen}
					<div class="absolute left-0 top-full mt-1 z-20 w-44 surface-panel p-1.5 motion-rise-in">
						<button
							class="w-full text-left px-2 py-1.5 rounded-md hover:bg-bg-tertiary/60 text-[12px] {filterMode === 'all' ? 'text-text' : 'text-text-secondary'}"
							onclick={() => { filterMode = 'all'; filterMenuOpen = false; }}
						>All datasets</button>
						<button
							class="w-full text-left px-2 py-1.5 rounded-md hover:bg-bg-tertiary/60 text-[12px] {filterMode === 'nonempty' ? 'text-text' : 'text-text-secondary'}"
							onclick={() => { filterMode = 'nonempty'; filterMenuOpen = false; }}
						>Has datapoints</button>
						<button
							class="w-full text-left px-2 py-1.5 rounded-md hover:bg-bg-tertiary/60 text-[12px] {filterMode === 'empty' ? 'text-text' : 'text-text-secondary'}"
							onclick={() => { filterMode = 'empty'; filterMenuOpen = false; }}
						>Empty datasets</button>
					</div>
				{/if}
			</div>

			<!-- Display / column visibility dropdown -->
			<div class="relative">
				<button
					class="btn-secondary h-7 text-[12px] motion-interactive"
					onclick={() => {
						displayMenuOpen = !displayMenuOpen;
						filterMenuOpen = false;
					}}
				>Display</button>
				{#if displayMenuOpen}
					<div class="absolute left-0 top-full mt-1 z-20 w-48 surface-panel p-2 space-y-1.5 text-[12px] motion-rise-in">
						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" bind:checked={showIdCol} class="accent-accent" /> ID
						</label>
						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" bind:checked={showCountCol} class="accent-accent" /> Datapoints
						</label>
						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" bind:checked={showCreatedCol} class="accent-accent" /> Created
						</label>
						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" bind:checked={showUpdatedCol} class="accent-accent" /> Last Updated
						</label>
						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" bind:checked={showEvalCol} class="accent-accent" /> Eval Score
						</label>
						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" bind:checked={showCreatedByCol} class="accent-accent" /> Created By
						</label>
					</div>
				{/if}
			</div>

			<!-- Time range chips -->
			<div class="flex items-center gap-1 ml-1">
				<button
					class={timeRange === 'all' ? 'query-chip query-chip-active' : 'query-chip'}
					onclick={() => (timeRange = 'all')}
				>All time</button>
				<button
					class={timeRange === '7d' ? 'query-chip query-chip-active' : 'query-chip'}
					onclick={() => (timeRange = '7d')}
				>Last 7d</button>
				<button
					class={timeRange === '30d' ? 'query-chip query-chip-active' : 'query-chip'}
					onclick={() => (timeRange = '30d')}
				>Last 30d</button>
			</div>

			<!-- Spacer + Search -->
			<div class="flex-1"></div>
			<div class="command-input-shell min-w-[320px]">
				<div class="pl-2.5 pr-1.5 text-text-muted/80">
					<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
					</svg>
				</div>
				<input bind:value={datasetSearch} type="text" placeholder="Search by dataset name..." class="command-input" />
			</div>
		</div>

		<!-- Bulk actions toolbar -->
		{#if selectionCount > 0}
			<div class="flex items-center gap-2 px-2 py-1.5 bg-bg-secondary rounded-md border border-border text-[12px] motion-rise-in">
				<span class="text-text-secondary">{selectionCount} selected</span>
				<div class="flex-1"></div>
				<button class="btn-ghost h-7 text-[12px]" onclick={handleBulkExport}>
					Export {selectionCount} selected
				</button>
				<button
					class="btn-ghost h-7 text-[12px] text-red-400 hover:text-red-300"
					disabled={bulkDeleting}
					onclick={handleBulkDelete}
				>
					{#if bulkDeleting}
						Deleting...
					{:else if confirmDeleteBulk}
						Confirm delete {selectionCount}?
					{:else}
						Delete {selectionCount} selected
					{/if}
				</button>
			</div>
		{/if}

		<!-- Table content -->
		{#if loading}
			<div class="text-text-muted text-sm text-center py-10">Loading...</div>
		{:else if visibleDatasets.length === 0}
			<div class="text-text-muted text-sm text-center py-10">No datasets match your current filters</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-[13px]">
					<thead>
						<tr class="table-head-compact border-b border-border/55">
							<th class="px-2.5 py-2.5 w-8 text-left">
								<input
									type="checkbox"
									class="accent-accent"
									checked={allSelected}
									onchange={toggleSelectAll}
								/>
							</th>
							{#if showIdCol}
								<th class="px-2 py-2.5 text-left">ID</th>
							{/if}
							<th
								class="px-2 py-2.5 text-left cursor-pointer select-none hover:text-text"
								onclick={() => toggleSort('name')}
							>Name{sortIndicator('name')}</th>
							{#if showCountCol}
								<th
									class="px-2 py-2.5 text-left cursor-pointer select-none hover:text-text"
									onclick={() => toggleSort('datapoints')}
								>Datapoints{sortIndicator('datapoints')}</th>
							{/if}
							{#if showCreatedCol}
								<th
									class="px-2 py-2.5 text-left cursor-pointer select-none hover:text-text"
									onclick={() => toggleSort('created')}
								>Created{sortIndicator('created')}</th>
							{/if}
							{#if showUpdatedCol}
								<th
									class="px-2 py-2.5 text-left cursor-pointer select-none hover:text-text"
									onclick={() => toggleSort('updated')}
								>Last Updated{sortIndicator('updated')}</th>
							{/if}
							{#if showEvalCol}
								<th
									class="px-2 py-2.5 text-left cursor-pointer select-none hover:text-text"
									onclick={() => toggleSort('eval')}
								>Eval Score{sortIndicator('eval')}</th>
							{/if}
							{#if showCreatedByCol}
								<th class="px-2 py-2.5 text-left">Created By</th>
							{/if}
							<th class="px-2 py-2.5 text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each visibleDatasets as ds (ds.id)}
							<tr class="border-b border-border/35 hover:bg-bg-secondary/40 motion-row">
								<td class="px-2.5 py-2.5">
									<input
										type="checkbox"
										class="accent-accent"
										checked={selectedIds.has(ds.id)}
										onchange={() => toggleSelection(ds.id)}
									/>
								</td>
								{#if showIdCol}
									<td class="px-2 py-2.5">
										<a href="/datasets/{ds.id}" class="font-mono text-[12px] text-text-secondary hover:text-text">{shortId(ds.id)}</a>
									</td>
								{/if}
								<td class="px-2 py-2.5">
									<a href="/datasets/{ds.id}" class="text-text font-medium hover:text-amber-400">{ds.name}</a>
									{#if ds.description}
										<div class="text-[12px] text-text-muted truncate mt-0.5">{ds.description}</div>
									{/if}
								</td>
								{#if showCountCol}
									<td class="px-2 py-2.5 text-text-secondary">{ds.datapoint_count}</td>
								{/if}
								{#if showCreatedCol}
									<td class="px-2 py-2.5 text-text-secondary">{formatDate(ds.created_at)}</td>
								{/if}
								{#if showUpdatedCol}
									<td class="px-2 py-2.5 text-text-secondary">{formatDate((ds as any).updated_at)}</td>
								{/if}
								{#if showEvalCol}
									<td class="px-2 py-2.5 text-text-secondary">
										{#if evalLoading.has(ds.id)}
											<span class="text-text-muted">&mdash;</span>
										{:else}
											{formatScore(evalScores.get(ds.id))}
										{/if}
									</td>
								{/if}
								{#if showCreatedByCol}
									<td class="px-2 py-2.5 text-text-secondary">{(ds as any).created_by ?? '\u2014'}</td>
								{/if}
								<td class="px-2 py-2.5 text-right">
									<button class="btn-ghost h-7 text-[12px]" onclick={(e) => handleDelete(e, ds.id)}>Delete</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Stats footer -->
			<div class="flex items-center gap-3 px-2.5 py-2 text-[12px] text-text-muted border-t border-border/35">
				<span>{datasets.length} dataset{datasets.length === 1 ? '' : 's'}</span>
				<span class="text-border">&middot;</span>
				<span>{totalDatapoints} total datapoint{totalDatapoints === 1 ? '' : 's'}</span>
			</div>
		{/if}
	</div>
</div>
