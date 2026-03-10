<script lang="ts">
	import { getSessions, type SessionSummary, shortId } from '$lib/api';
	import { onMount } from 'svelte';

	let sessions: SessionSummary[] = $state([]);
	let loading = $state(true);
	let q = $state('');

	const filtered = $derived.by(() => {
		const query = q.trim().toLowerCase();
		if (!query) return sessions;
		return sessions.filter((s) => s.id.toLowerCase().includes(query));
	});

	onMount(async () => {
		try {
			const res = await getSessions();
			sessions = res.items;
		} finally {
			loading = false;
		}
	});
</script>

<div class="app-shell-wide space-y-3">
	<div class="flex items-center gap-1.5">
		<a class="query-chip" href="/traces">Traces</a>
		<a class="query-chip" href="/spans">Spans</a>
		<button class="query-chip query-chip-active">Sessions</button>
		<div class="flex-1"></div>
		<input class="control-input h-8 text-[12px] w-64" bind:value={q} placeholder="Search session id" />
	</div>

	<div class="table-float overflow-hidden">
		<div class="grid grid-cols-[1fr_120px_120px_130px_110px] gap-3 px-3 py-2 table-head-compact border-b border-border/55">
			<span>Session</span><span class="text-right">Traces</span><span class="text-right">Spans</span><span class="text-right">Tokens</span><span class="text-right">Cost</span>
		</div>
		{#if loading}
			<div class="py-8 text-center text-sm text-text-muted">Loading sessions...</div>
		{:else if filtered.length === 0}
			<div class="py-8 text-center text-sm text-text-muted">No sessions found. Add trace tag like <span class="font-mono">session_id:abc</span>.</div>
		{:else}
			{#each filtered as s (s.id)}
				<div class="grid grid-cols-[1fr_120px_120px_130px_110px] gap-3 px-3 py-2 border-b border-border/45 motion-row items-center">
					<span class="font-mono text-[12px] truncate">{shortId(s.id)} <span class="text-text-muted">{s.id}</span></span>
					<span class="text-right text-[12px] font-mono">{s.trace_count}</span>
					<span class="text-right text-[12px] font-mono">{s.span_count}</span>
					<span class="text-right text-[12px] font-mono">{s.total_tokens.toLocaleString()}</span>
					<span class="text-right text-[12px] font-mono">${s.total_cost.toFixed(4)}</span>
				</div>
			{/each}
		{/if}
	</div>
</div>
