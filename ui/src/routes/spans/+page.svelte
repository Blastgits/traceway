<script lang="ts">
	import { getSpans, type Span } from '$lib/api';
	import { spanDurationMs, spanStatus, shortId } from '$lib/api';
	import { onMount } from 'svelte';

	let spans: Span[] = $state([]);
	let loading = $state(true);
	let q = $state('');

	const filtered = $derived.by(() => {
		const query = q.trim().toLowerCase();
		if (!query) return spans;
		return spans.filter((s) => s.name.toLowerCase().includes(query) || s.trace_id.toLowerCase().includes(query) || s.kind.type.toLowerCase().includes(query));
	});

	onMount(async () => {
		try {
			const res = await getSpans();
			spans = res.items;
		} finally {
			loading = false;
		}
	});
</script>

<div class="app-shell-wide space-y-3">
	<div class="flex items-center gap-1.5">
		<a class="query-chip" href="/traces">Traces</a>
		<button class="query-chip query-chip-active">Spans</button>
		<a class="query-chip" href="/sessions">Sessions</a>
		<div class="flex-1"></div>
		<input class="control-input h-8 text-[12px] w-64" bind:value={q} placeholder="Search spans" />
	</div>

	<div class="table-float overflow-hidden">
		<div class="grid grid-cols-[220px_1fr_120px_110px_100px] gap-3 px-3 py-2 table-head-compact border-b border-border/55">
			<span>ID</span><span>Name</span><span>Kind</span><span>Status</span><span class="text-right">Duration</span>
		</div>
		{#if loading}
			<div class="py-8 text-center text-sm text-text-muted">Loading spans...</div>
		{:else if filtered.length === 0}
			<div class="py-8 text-center text-sm text-text-muted">No spans found</div>
		{:else}
			{#each filtered as s (s.id)}
				<a href={`/traces/${s.trace_id}`} class="grid grid-cols-[220px_1fr_120px_110px_100px] gap-3 px-3 py-2 border-b border-border/45 hover:bg-bg-secondary/35 motion-row items-center">
					<span class="font-mono text-[12px] truncate">{shortId(s.id)} <span class="text-text-muted">{shortId(s.trace_id)}</span></span>
					<span class="truncate text-[13px]">{s.name}</span>
					<span class="text-[12px] text-text-muted">{s.kind.type}</span>
					<span class="text-[12px] capitalize {spanStatus(s) === 'failed' ? 'text-danger' : spanStatus(s) === 'running' ? 'text-warning' : 'text-success'}">{spanStatus(s)}</span>
					<span class="text-right text-[12px] font-mono text-text-muted">{spanDurationMs(s) ?? 0}ms</span>
				</a>
			{/each}
		{/if}
	</div>
</div>
