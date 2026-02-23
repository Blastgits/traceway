<script lang="ts">
	import { goto } from '$app/navigation';
	import { getTraces, getSpans, subscribeEvents, API_BASE, type Span, type Trace } from '$lib/api';
	import { spanStatus } from '$lib/api';
	import TraceRow from '$lib/components/TraceRow.svelte';
	import { onMount } from 'svelte';

	function baseUrl() {
		if (API_BASE.startsWith('http')) return API_BASE;
		return window.location.origin + API_BASE;
	}

	let traces: Trace[] = $state([]);
	let traceSpans: Map<string, Span[]> = $state(new Map());
	let filterModel = $state('');
	let filterStatus = $state('');
	let loading = $state(true);

	async function loadTraces() {
		try {
			// Two calls in parallel instead of N+1
			const [traceResult, spanResult] = await Promise.all([
				getTraces(),
				getSpans()
			]);
			traces = traceResult.traces;

			// Group spans by trace_id client-side
			const spanMap = new Map<string, Span[]>();
			for (const span of spanResult.spans) {
				const existing = spanMap.get(span.trace_id) ?? [];
				existing.push(span);
				spanMap.set(span.trace_id, existing);
			}
			traceSpans = spanMap;
		} catch {
			// API not available
		}
		loading = false;
	}

	onMount(() => {
		loadTraces();

		const unsub = subscribeEvents((event) => {
			if (event.type === 'span_created') {
				const tid = event.span.trace_id;
				const existing = traceSpans.get(tid) ?? [];
				traceSpans.set(tid, [...existing, event.span]);
				traceSpans = new Map(traceSpans);
				if (!traces.some(t => t.id === tid)) {
					// New trace — reload to get trace metadata
					loadTraces();
				}
			} else if (event.type === 'span_completed' || event.type === 'span_failed') {
				const tid = event.span.trace_id;
				const existing = traceSpans.get(tid);
				if (existing) {
					traceSpans.set(
						tid,
						existing.map((s) => (s.id === event.span.id ? event.span : s))
					);
					traceSpans = new Map(traceSpans);
				}
			} else if (event.type === 'trace_deleted') {
				traceSpans.delete(event.trace_id);
				traceSpans = new Map(traceSpans);
				traces = traces.filter((t) => t.id !== event.trace_id);
			} else if (event.type === 'cleared') {
				traceSpans = new Map();
				traces = [];
			}
		});

		return unsub;
	});

	const filtered = $derived.by(() => {
		return traces.filter((trace) => {
			const spans = traceSpans.get(trace.id) ?? [];
			if (filterModel) {
				const hasModel = spans.some((s) =>
					s.kind?.type === 'llm_call' && s.kind.model?.includes(filterModel)
				);
				if (!hasModel) return false;
			}
			if (filterStatus) {
				const traceStatus = spans.some((s) => spanStatus(s) === 'failed')
					? 'failed'
					: spans.some((s) => spanStatus(s) === 'running')
						? 'running'
						: 'completed';
				if (traceStatus !== filterStatus) return false;
			}
			return true;
		});
	});
</script>

<div class="max-w-6xl mx-auto space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-bold">Traces</h1>
		<div class="flex items-center gap-2 text-sm">
			<input
				type="text"
				placeholder="Filter model..."
				bind:value={filterModel}
				class="bg-bg-tertiary border border-border rounded px-2 py-1 text-xs text-text placeholder:text-text-muted w-36"
			/>
			<select
				bind:value={filterStatus}
				id="filter-status"
				class="bg-bg-tertiary border border-border rounded px-2 py-1 text-xs text-text"
			>
				<option value="">All statuses</option>
				<option value="running">Running</option>
				<option value="completed">Completed</option>
				<option value="failed">Failed</option>
			</select>
		</div>
	</div>

	<!-- Table header -->
	<div class="grid grid-cols-[1fr_80px_100px_140px_100px_100px_60px] gap-4 px-3 text-xs text-text-muted uppercase">
		<span>Trace</span>
		<span class="text-center">Spans</span>
		<span class="text-center">Status</span>
		<span>Started</span>
		<span class="text-right">Duration</span>
		<span>Model</span>
		<span></span>
	</div>

	{#if loading}
		<div class="text-text-muted text-sm text-center py-8">Loading...</div>
	{:else if traces.length === 0}
		<!-- Empty state -->
		<div class="space-y-4">
			<div class="space-y-1">
				<div class="flex items-center gap-2">
					<span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
					<span class="text-xs text-text-secondary">Listening for traces</span>
				</div>
				<p class="text-text-muted text-xs">Send traces from your code to see them here.</p>
			</div>

			<div class="relative group/code">
				<pre class="bg-bg-tertiary border border-border rounded-lg p-4 text-[13px] text-text-secondary font-mono overflow-x-auto leading-relaxed">pip install traceway

from traceway import Traceway, LlmCallKind

client = Traceway(url="{baseUrl().replace('/api', '')}")

with client.trace("my-agent") as t:
    with t.llm_call("inference", model="gpt-4o") as span:
        result = openai.chat.completions.create(...)
        span.set_output({`{"response": result}`})</pre>
			</div>

			<p class="text-text-muted text-[11px]">
				See <a href="/settings" class="text-accent hover:underline">Settings</a> for API keys and more examples.
			</p>
		</div>
	{:else if filtered.length === 0}
		<div class="text-text-muted text-sm text-center py-8">No traces match filters</div>
	{:else}
		<div class="space-y-0">
			{#each filtered as trace (trace.id)}
				<TraceRow traceId={trace.id} spans={traceSpans.get(trace.id) ?? []} onDelete={(id) => {
					traces = traces.filter(t => t.id !== id);
					traceSpans.delete(id);
					traceSpans = new Map(traceSpans);
				}} />
			{/each}
		</div>
	{/if}
</div>
