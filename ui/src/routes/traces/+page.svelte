<script lang="ts">
	import { goto } from '$app/navigation';
	import { getTraces, getSpans, subscribeEvents, getAuthConfig, createApiKey, shortId, type Span, type Trace, type AuthConfig, type ApiKeyCreated } from '$lib/api';
	import { spanDurationMs, spanStatus } from '$lib/api';
	import { onMount } from 'svelte';

	let traces: Trace[] = $state([]);
	let traceSpans: Map<string, Span[]> = $state(new Map());
	let filterText = $state('');
	let loading = $state(true);
	let rangeDays: '1d' | '7d' | '30d' = $state('7d');
	let selectedTraceId: string | null = $state(null);
	let traceListOpen = $state(true);

	type TraceStatus = 'failed' | 'running' | 'completed';
	type TraceInsights = {
		status: TraceStatus;
		totalTokens: number;
		totalDuration: number;
		models: string[];
		searchables: string[];
	};

	// Onboarding state
	let authConfig = $state<AuthConfig | null>(null);
	let createdKey = $state<ApiKeyCreated | null>(null);
	let creatingKey = $state(false);
	let createKeyError = $state('');
	let keyName = $state('default');
	let envCopied = $state(false);
	let codeCopied = $state(false);
	let showKeyForm = $state(false);

	const isCloudMode = $derived(authConfig?.mode === 'cloud');
	const tracewayUrl = $derived.by(() => {
		if (typeof window === 'undefined') return 'http://localhost:3000';
		const viteUrl = import.meta.env.VITE_API_URL as string;
		if (viteUrl) return viteUrl.replace(/\/api$/, '');
		// In cloud mode, the API is at api.traceway.ai
		if (isCloudMode) return 'https://api.traceway.ai';
		return window.location.origin;
	});

	const apiKeyValue = $derived(createdKey ? createdKey.key : 'tw_sk_...');

	const envSnippet = $derived.by(() => {
		if (isCloudMode || createdKey) {
			return `TRACEWAY_API_KEY="${apiKeyValue}"\nTRACEWAY_URL="${tracewayUrl}"`;
		}
		return `TRACEWAY_URL="${tracewayUrl}"`;
	});

	const codeSnippet = $derived.by(() => {
		return `import os
from openai import OpenAI
from traceway import Traceway

client = Traceway()
openai = OpenAI()

with client.trace("summarize-doc") as t:
    with t.llm_call("generate-summary", model="gpt-4o"):
        resp = openai.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "Summarize: ..."}],
        )
        print(resp.choices[0].message.content)`;
	});

	async function handleCreateKey() {
		creatingKey = true;
		createKeyError = '';
		try {
			createdKey = await createApiKey(keyName.trim() || 'default');
			showKeyForm = false;
		} catch (e: any) {
			createKeyError = e?.message || 'Failed to create API key';
		}
		creatingKey = false;
	}

	function copyEnv() {
		navigator.clipboard.writeText(envSnippet);
		envCopied = true;
		setTimeout(() => (envCopied = false), 2000);
	}

	function copyCode() {
		navigator.clipboard.writeText(codeSnippet);
		codeCopied = true;
		setTimeout(() => (codeCopied = false), 2000);
	}

	async function loadTraces() {
		try {
			// Load all trace pages so the picker is complete
			let allTraces: Trace[] = [];
			let cursor: string | null = null;
			for (let i = 0; i < 20; i++) {
				const page = await getTraces(cursor ? { cursor } : undefined);
				allTraces = allTraces.concat(page.items);
				if (!page.has_more || !page.next_cursor) break;
				cursor = page.next_cursor;
			}

			const spanResult = await getSpans();
			traces = allTraces.sort(
				(a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
			);

			// Group spans by trace_id client-side
			const allSpans: Span[] = spanResult.items;
			const spanMap = new Map<string, Span[]>();
			for (const span of allSpans) {
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
		getAuthConfig().then((c) => (authConfig = c)).catch(() => {});

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

	function toInsights(spans: Span[]): TraceInsights {
		const status: TraceStatus = spans.some((s) => spanStatus(s) === 'failed')
			? 'failed'
			: spans.some((s) => spanStatus(s) === 'running')
				? 'running'
				: 'completed';

		let totalTokens = 0;
		let totalDuration = 0;
		const models = new Set<string>();

		for (const span of spans) {
			if (span.kind?.type === 'llm_call') {
				totalTokens += (span.kind.input_tokens ?? 0) + (span.kind.output_tokens ?? 0);
				if (span.kind.model) models.add(span.kind.model);
			}
			const duration = spanDurationMs(span);
			if (duration !== null) totalDuration = Math.max(totalDuration, duration);
		}

		const root = spans.find((s) => !s.parent_id);
		const searchables = [root?.name ?? '', ...spans.map((s) => s.name)];

		return {
			status,
			totalTokens,
			totalDuration,
			models: [...models],
			searchables
		};
	}

	const traceInsights = $derived.by(() => {
		const map = new Map<string, TraceInsights>();
		for (const trace of traces) {
			map.set(trace.id, toInsights(traceSpans.get(trace.id) ?? []));
		}
		return map;
	});

	const filtered = $derived.by(() => {
		const query = filterText.trim().toLowerCase();
		const terms = query.split(/\s+/).filter(Boolean);

		return traces.filter((trace) => {
			const spans = traceSpans.get(trace.id) ?? [];
			const insights = traceInsights.get(trace.id) ?? toInsights(spans);

			if (terms.length > 0) {
				const haystack = [
					trace.id.toLowerCase(),
					...insights.searchables.map((name) => name.toLowerCase()),
					...insights.models.map((model) => model.toLowerCase()),
					insights.status
				];
				for (const term of terms) {
					if (term.startsWith('status:')) {
						if (insights.status !== term.slice(7)) return false;
						continue;
					}
					if (term.startsWith('model:')) {
						const m = term.slice(6);
						if (!insights.models.some((model) => model.toLowerCase().includes(m))) return false;
						continue;
					}
					if (!haystack.some((h) => h.includes(term))) return false;
				}
			}
			return true;
		});
	});

	const listedRows = $derived.by(() => {
		return filtered.map((trace) => {
			const spans = traceSpans.get(trace.id) ?? [];
			const insights = traceInsights.get(trace.id) ?? toInsights(spans);
			const root = spans.find((s) => !s.parent_id);
			return {
				id: trace.id,
				startedAt: trace.started_at,
				rootName: root?.name ?? 'trace',
				status: insights.status,
				duration: insights.totalDuration,
				tokens: insights.totalTokens,
				model: insights.models[0] ?? '-'
			};
		});
	});

	const histogram = $derived.by(() => {
		const now = Date.now();
		const days = rangeDays === '1d' ? 1 : rangeDays === '7d' ? 7 : 30;
		const start = now - days * 24 * 60 * 60 * 1000;
		const bucketCount = Math.min(days * 2, 24);
		const bucketMs = (now - start) / bucketCount;
		const buckets = Array.from({ length: bucketCount }, (_, i) => ({ idx: i, count: 0 }));
		for (const row of listedRows) {
			const ts = new Date(row.startedAt).getTime();
			if (ts < start || ts > now) continue;
			const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((ts - start) / bucketMs)));
			buckets[idx].count += 1;
		}
		const max = Math.max(1, ...buckets.map((b) => b.count));
		return { buckets, max };
	});

	const selectedTraceRow = $derived.by(() => listedRows.find((r) => r.id === selectedTraceId) ?? listedRows[0] ?? null);
	const selectedTraceSpans = $derived.by(() => {
		if (!selectedTraceRow) return [] as Span[];
		const spans = traceSpans.get(selectedTraceRow.id) ?? [];
		return [...spans]
			.sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
	});
	let selectedPreviewSpanId = $state<string | null>(null);
	const selectedPreviewSpan = $derived.by(
		() => selectedTraceSpans.find((s) => s.id === selectedPreviewSpanId) ?? selectedTraceSpans[0] ?? null
	);

	function formatDuration(ms: number | null): string {
		if (ms == null) return '-';
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	}

	function spanTokenTotal(s: Span | null): number {
		if (!s || s.kind?.type !== 'llm_call') return 0;
		return (s.kind.input_tokens ?? 0) + (s.kind.output_tokens ?? 0);
	}

	function spanCost(s: Span | null): string {
		if (!s || s.kind?.type !== 'llm_call' || s.kind.cost == null) return '0.000';
		return s.kind.cost.toFixed(3);
	}

	$effect(() => {
		if (listedRows.length === 0) {
			selectedTraceId = null;
			return;
		}
		if (!selectedTraceId || !listedRows.some((r) => r.id === selectedTraceId)) {
			selectedTraceId = listedRows[0].id;
		}
	});

	$effect(() => {
		if (selectedTraceSpans.length === 0) {
			selectedPreviewSpanId = null;
			return;
		}
		if (!selectedPreviewSpanId || !selectedTraceSpans.some((s) => s.id === selectedPreviewSpanId)) {
			selectedPreviewSpanId = selectedTraceSpans[0].id;
		}
	});

</script>

<div class="app-shell-wide space-y-4">
	{#if loading}
		<div class="text-text-muted text-sm text-center py-8">Loading...</div>
	{:else if traces.length === 0}
		<!-- Empty state: centered onboarding -->
		<div class="flex justify-center py-12">
			<div class="space-y-5 w-full max-w-5xl">
				<div class="space-y-1">
					<h1 class="text-xl font-bold text-text">Traces</h1>
					<div class="flex items-center gap-2">
						<span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
						<span class="text-xs text-text-muted">Listening for traces</span>
					</div>
				</div>

				<!-- API Key creation (cloud mode only) -->
				{#if isCloudMode && !createdKey}
					<div class="space-y-2">
						{#if !showKeyForm}
							<button
								onclick={() => (showKeyForm = true)}
								class="px-3 py-1.5 text-sm bg-accent text-bg font-semibold rounded hover:bg-accent/80 transition-colors"
							>
								Create API key
							</button>
							<p class="text-[11px] text-text-muted">
								Or use an existing key from <a href="/settings/api-keys" class="text-accent hover:underline">Settings &rarr; API Keys</a>
							</p>
						{:else}
							<div class="table-float p-3 space-y-3">
								<div>
									<label for="onboard-key-name" class="block text-xs text-text-secondary mb-1">Key name</label>
									<input
										id="onboard-key-name"
										type="text"
										bind:value={keyName}
										placeholder="e.g. development"
										class="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
									/>
								</div>
								{#if createKeyError}
									<p class="text-[11px] text-danger">{createKeyError}</p>
								{/if}
								<div class="flex gap-2">
									<button
										onclick={handleCreateKey}
										disabled={creatingKey}
										class="px-3 py-1.5 text-sm bg-accent text-bg font-semibold rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50"
									>
										{creatingKey ? 'Creating...' : 'Create key'}
									</button>
									<button
										onclick={() => (showKeyForm = false)}
										class="px-3 py-1.5 text-sm bg-bg-tertiary text-text rounded-lg hover:bg-bg-secondary transition-colors"
									>
										Cancel
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- .env snippet (with real key if just created) -->
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<span class="text-xs text-text-muted font-medium">.env</span>
						<button
							onclick={copyEnv}
							class="text-[11px] text-text-muted hover:text-text transition-colors"
						>
							{envCopied ? 'Copied!' : 'Copy'}
						</button>
					</div>
					<pre class="bg-bg-tertiary border border-border rounded p-3 text-[13px] text-text-secondary font-mono leading-relaxed">{envSnippet}</pre>
					{#if createdKey}
						<p class="text-[11px] text-text-muted">Your key is shown once. Copy the .env now.</p>
					{/if}
				</div>

				<!-- Code snippet -->
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<span class="text-xs text-text-muted font-medium">quickstart.py</span>
						<button
							onclick={copyCode}
							class="text-[11px] text-text-muted hover:text-text transition-colors"
						>
							{codeCopied ? 'Copied!' : 'Copy'}
						</button>
					</div>
					<pre class="bg-bg-tertiary border border-border rounded p-3 text-[13px] text-text-secondary font-mono leading-relaxed">{codeSnippet}</pre>
				</div>

				<a href="https://docs.traceway.ai" target="_blank" rel="noopener" class="inline-block text-accent text-xs hover:underline">
					Read the docs &rarr;
				</a>
			</div>
		</div>
	{:else}
		<div class="space-y-3 pb-10">
			<div class="flex items-center gap-1.5">
				<button class="query-chip query-chip-active">Traces</button>
				<a class="query-chip" href="/spans">Spans</a>
				<a class="query-chip" href="/sessions">Sessions</a>
				<div class="flex-1"></div>
				<input class="control-input h-8 text-[12px] w-72" placeholder="Search text, name, id, tags..." bind:value={filterText} />
				<select bind:value={rangeDays} class="control-select h-8 w-[74px] text-[12px]">
					<option value="1d">1d</option>
					<option value="7d">7d</option>
					<option value="30d">30d</option>
				</select>
			</div>

			<div class="table-float overflow-hidden">
				<div class="p-2.5 border-b border-border/55">
					<div class="h-24 rounded-lg border border-border/55 bg-bg-secondary/22 p-2 flex items-end gap-1.5">
						{#each histogram.buckets as b}
							<div class="flex-1 rounded-sm bg-accent/75 min-h-[3px]" style={`height:${Math.max(3, (b.count / histogram.max) * 100)}%`}></div>
						{/each}
					</div>
					<div class="text-[11px] text-text-muted mt-1.5">Total: {filtered.length} / {traces.length}</div>
				</div>

				<div class="grid grid-cols-[190px_1fr_110px_150px_110px_100px_70px] gap-3 px-3 py-2 table-head-compact border-b border-border/55">
					<span>ID</span>
					<span>Top level span</span>
					<span>Status</span>
					<span>Model</span>
					<span class="text-right">Tokens</span>
					<span class="text-right">Duration</span>
					<span class="text-right">Open</span>
				</div>

				{#if listedRows.length === 0}
					<div class="py-8 text-center text-sm text-text-muted">No traces match current filters</div>
				{:else}
					{#each listedRows as row (row.id)}
						<a href={`/traces/${row.id}`} class="grid grid-cols-[190px_1fr_110px_150px_110px_100px_70px] gap-3 px-3 py-2 border-b border-border/45 hover:bg-bg-secondary/35 motion-row items-center">
							<span class="font-mono text-[12px] truncate">{shortId(row.id)}</span>
							<span class="truncate text-[13px]">{row.rootName}</span>
							<span class="text-[12px] capitalize {row.status === 'failed' ? 'text-danger' : row.status === 'running' ? 'text-warning' : 'text-success'}">{row.status}</span>
							<span class="text-[12px] text-text-muted truncate">{row.model}</span>
							<span class="text-right text-[12px] font-mono text-text-muted">{row.tokens.toLocaleString()}</span>
							<span class="text-right text-[12px] font-mono text-text-muted">{row.duration}ms</span>
							<span class="text-right text-[11px] text-accent">Open</span>
						</a>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
