<script lang="ts">
	import { getAnalyticsSummary, getSpans, subscribeEvents, API_BASE, type Span, type AnalyticsSummary } from '$lib/api';
	import { spanStatus, spanStartedAt, spanModel, shortId } from '$lib/api';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { onMount } from 'svelte';

	let copied = $state('');

	function baseUrl() {
		if (API_BASE.startsWith('http')) return API_BASE;
		return window.location.origin + API_BASE;
	}

	async function copyText(text: string, id: string) {
		await navigator.clipboard.writeText(text);
		copied = id;
		setTimeout(() => { if (copied === id) copied = ''; }, 2000);
	}

	let summary: AnalyticsSummary | null = $state(null);
	let recentSpans: Span[] = $state([]);
	let activity: { time: string; text: string }[] = $state([]);
	let loaded = $state(false);

	const errorRate = $derived.by(() => {
		const s = summary;
		if (s && s.total_spans > 0) {
			return ((s.error_count / s.total_spans) * 100).toFixed(1);
		}
		return '0.0';
	});

	function addActivity(text: string) {
		const time = new Date().toLocaleTimeString();
		activity = [{ time, text }, ...activity.slice(0, 49)];
	}

	async function loadData() {
		try {
			const [s, spanRes] = await Promise.all([
				getAnalyticsSummary().catch(() => null),
				getSpans()
			]);
			summary = s;
			recentSpans = spanRes.spans
				.sort((a, b) => new Date(spanStartedAt(b)).getTime() - new Date(spanStartedAt(a)).getTime())
				.slice(0, 20);
		} catch {
			// API not available
		}
		loaded = true;
	}

	onMount(() => {
		loadData();

		const unsub = subscribeEvents((event) => {
			if (event.type === 'span_created') {
				addActivity(`Span created: ${event.span.name}`);
				recentSpans = [event.span, ...recentSpans.slice(0, 19)];
			} else if (event.type === 'span_completed') {
				addActivity(`Span completed: ${event.span.name}`);
				recentSpans = recentSpans.map((s) => (s.id === event.span.id ? event.span : s));
			} else if (event.type === 'span_failed') {
				addActivity(`Span failed: ${event.span.name}`);
				recentSpans = recentSpans.map((s) => (s.id === event.span.id ? event.span : s));
			} else if (event.type === 'span_deleted') {
				addActivity(`Span deleted: ${shortId(event.span_id)}`);
			} else if (event.type === 'trace_deleted') {
				addActivity(`Trace deleted: ${shortId(event.trace_id)}`);
				loadData();
			} else if (event.type === 'cleared') {
				addActivity('All traces cleared');
				summary = null;
				recentSpans = [];
			}
		});

		// Refresh summary periodically
		const interval = setInterval(() => {
			getAnalyticsSummary().then((s) => (summary = s)).catch(() => {});
		}, 10000);

		return () => {
			unsub();
			clearInterval(interval);
		};
	});
</script>

<div class="max-w-6xl mx-auto space-y-6">
	<h1 class="text-xl font-bold">Dashboard</h1>

	{#if !loaded}
		<div class="text-text-muted text-sm py-8 text-center">Loading...</div>
	{:else if !summary || (summary.total_traces === 0 && summary.total_spans === 0)}
		<!-- Getting started -->
		<div class="space-y-6">
			<div class="space-y-1">
				<div class="flex items-center gap-2">
					<span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
					<span class="text-sm text-text-secondary">Connected</span>
				</div>
				<p class="text-text-muted text-xs">Send your first trace to get started.</p>
			</div>

			<!-- Tabs -->
			{#snippet codeBlock(id: string, code: string)}
				<div class="relative group/code">
					<pre class="bg-bg-tertiary border border-border rounded-lg p-4 text-[13px] text-text-secondary font-mono overflow-x-auto leading-relaxed">{code}</pre>
					<button
						onclick={() => copyText(code, id)}
						class="absolute top-2.5 right-2.5 px-2 py-1 rounded text-[11px] font-mono
							   bg-bg-secondary border border-border text-text-muted
							   opacity-0 group-hover/code:opacity-100 transition-opacity
							   hover:text-text hover:border-text-muted cursor-pointer"
					>
						{copied === id ? 'copied' : 'copy'}
					</button>
				</div>
			{/snippet}

			<div class="space-y-4">
				<!-- Python SDK -->
				<div class="space-y-2">
					<div class="flex items-center gap-2">
						<span class="text-xs font-semibold text-text tracking-wide">Python SDK</span>
						<span class="text-[10px] text-text-muted font-mono bg-bg-tertiary px-1.5 py-0.5 rounded">recommended</span>
					</div>
					{@render codeBlock('py-install', 'pip install traceway')}
					{@render codeBlock('py-usage', `from traceway import Traceway, LlmCallKind

client = Traceway(
    url="${baseUrl().replace('/api', '')}",
    api_key="tw_sk_..."  # from Settings > API Keys
)

with client.trace("my-agent") as t:
    with t.llm_call("inference",
        model="gpt-4o",
        provider="openai"
    ) as span:
        result = openai.chat.completions.create(...)
        span.set_output({"response": result.choices[0].message.content})`)}
				</div>

				<!-- curl -->
				<details class="group">
					<summary class="text-xs font-semibold text-text-secondary cursor-pointer hover:text-text transition-colors tracking-wide">
						curl
					</summary>
					<div class="mt-2 space-y-2">
						{@render codeBlock('curl', `# Create a trace
TRACE=$(curl -s ${baseUrl()}/traces -X POST \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer tw_sk_...' \\
  -d '{"name":"my-trace","tags":["test"]}' \\
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Create a span in that trace
curl -s ${baseUrl()}/spans -X POST \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer tw_sk_...' \\
  -d '{"trace_id":"'$TRACE'","name":"llm-call","kind":{"type":"llm_call","model":"gpt-4o"}}'

# Complete the span
curl -s ${baseUrl()}/spans/<SPAN_ID>/complete -X POST \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer tw_sk_...' \\
  -d '{"output":{"result":"hello world"}}'`)}
					</div>
				</details>

				<!-- Node.js -->
				<details class="group">
					<summary class="text-xs font-semibold text-text-secondary cursor-pointer hover:text-text transition-colors tracking-wide">
						Node.js / fetch
					</summary>
					<div class="mt-2">
						{@render codeBlock('node', `const API = "${baseUrl()}";
const KEY = "tw_sk_...";
const headers = {
  "Content-Type": "application/json",
  "Authorization": \`Bearer \${KEY}\`
};

// Create trace
const trace = await fetch(\`\${API}/traces\`, {
  method: "POST", headers,
  body: JSON.stringify({ name: "my-agent", tags: ["prod"] })
}).then(r => r.json());

// Create span
const span = await fetch(\`\${API}/spans\`, {
  method: "POST", headers,
  body: JSON.stringify({
    trace_id: trace.id,
    name: "llm-call",
    kind: { type: "llm_call", model: "gpt-4o", provider: "openai" }
  })
}).then(r => r.json());

// Complete span
await fetch(\`\${API}/spans/\${span.id}/complete\`, {
  method: "POST", headers,
  body: JSON.stringify({ output: { response: "..." } })
});`)}
					</div>
				</details>
			</div>
		</div>
	{:else}
		<!-- Stats cards -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
			<div class="bg-bg-secondary border border-border rounded p-4">
				<div class="text-text-muted text-xs uppercase">Traces</div>
				<div class="text-2xl font-bold text-text mt-1">{summary.total_traces}</div>
			</div>
			<div class="bg-bg-secondary border border-border rounded p-4">
				<div class="text-text-muted text-xs uppercase">Spans</div>
				<div class="text-2xl font-bold text-text mt-1">{summary.total_spans}</div>
			</div>
			<div class="bg-bg-secondary border border-border rounded p-4">
				<div class="text-text-muted text-xs uppercase">Avg Latency</div>
				<div class="text-2xl font-bold text-text mt-1">{Math.round(summary.avg_latency_ms)}ms</div>
			</div>
			<div class="bg-bg-secondary border border-border rounded p-4">
				<div class="text-text-muted text-xs uppercase">Error Rate</div>
				<div class="text-2xl font-bold {parseFloat(errorRate) > 0 ? 'text-danger' : 'text-success'} mt-1">
					{errorRate}%
				</div>
			</div>
		</div>

		<!-- LLM metrics row -->
		{#if summary.total_llm_calls > 0}
			<div class="grid grid-cols-3 gap-4">
				<div class="bg-bg-secondary border border-border rounded p-4">
					<div class="text-text-muted text-xs uppercase">LLM Calls</div>
					<div class="text-xl font-bold text-text mt-1">{summary.total_llm_calls}</div>
				</div>
				<div class="bg-bg-secondary border border-border rounded p-4">
					<div class="text-text-muted text-xs uppercase">Total Tokens</div>
					<div class="text-xl font-bold text-text mt-1">{summary.total_tokens.toLocaleString()}</div>
				</div>
				<div class="bg-bg-secondary border border-border rounded p-4">
					<div class="text-text-muted text-xs uppercase">Total Cost</div>
					<div class="text-xl font-bold text-text mt-1">${summary.total_cost.toFixed(4)}</div>
				</div>
			</div>
		{/if}

		<!-- Models & Providers -->
		{#if summary.models_used.length > 0}
			<div class="bg-bg-secondary border border-border rounded p-4">
				<div class="text-text-muted text-xs uppercase mb-2">Models</div>
				<div class="flex flex-wrap gap-2">
					{#each summary.cost_by_model as item}
						<span class="bg-bg-tertiary border border-border rounded px-2 py-1 text-xs">
							<span class="text-accent">{item.model}</span>
							<span class="text-text-muted ml-1">{item.span_count} calls</span>
							{#if item.cost > 0}
								<span class="text-text-muted ml-1">${item.cost.toFixed(4)}</span>
							{/if}
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Token breakdown by model -->
		{#if summary.tokens_by_model.length > 0}
			<div class="bg-bg-secondary border border-border rounded p-4">
				<div class="text-text-muted text-xs uppercase mb-3">Tokens by Model</div>
				<div class="space-y-2">
					{#each summary.tokens_by_model as item}
						{@const maxTokens = Math.max(...summary.tokens_by_model.map(t => t.total_tokens))}
						<div class="flex items-center gap-3 text-sm">
							<span class="text-text w-40 truncate font-mono text-xs">{item.model}</span>
							<div class="flex-1 bg-bg-tertiary rounded-full h-2 overflow-hidden">
								<div class="h-full bg-purple-400/60 rounded-full" style="width: {maxTokens > 0 ? (item.total_tokens / maxTokens * 100) : 0}%"></div>
							</div>
							<span class="text-text-muted text-xs w-24 text-right font-mono">{item.total_tokens.toLocaleString()}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<!-- Recent spans -->
			<div class="bg-bg-secondary border border-border rounded p-4">
				<div class="text-text-muted text-xs uppercase mb-3">Recent Spans</div>
				<div class="space-y-1 max-h-80 overflow-y-auto">
					{#each recentSpans as span (span.id)}
						<div class="flex items-center gap-2 text-xs py-1">
							<StatusBadge status={spanStatus(span)} />
							<a href="/traces/{span.trace_id}" class="text-accent hover:underline font-mono">
								{shortId(span.trace_id)}
							</a>
							<span class="text-text truncate flex-1">{span.name}</span>
							{#if spanModel(span)}
								<span class="text-text-muted">{spanModel(span)}</span>
							{/if}
						</div>
					{:else}
						<div class="text-text-muted text-sm">No spans yet</div>
					{/each}
				</div>
			</div>

			<!-- Activity feed -->
			<div class="bg-bg-secondary border border-border rounded p-4">
				<div class="text-text-muted text-xs uppercase mb-3">Activity Feed</div>
				<div class="space-y-1 max-h-80 overflow-y-auto">
					{#each activity as item}
						<div class="text-xs py-0.5">
							<span class="text-text-muted font-mono">{item.time}</span>
							<span class="text-text ml-2">{item.text}</span>
						</div>
					{:else}
						<div class="text-text-muted text-sm">Waiting for events...</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
