<script lang="ts">
	import type { Span } from '$lib/api';
	import { spanStatus, spanStartedAt, spanDurationMs } from '$lib/api';
	import SpanKindIcon from './SpanKindIcon.svelte';
	import StatusBadge from './StatusBadge.svelte';

	let {
		spans,
		selectedId = null,
		onSelect,
		searchQuery = ''
	}: {
		spans: Span[];
		selectedId?: string | null;
		onSelect?: (span: Span) => void;
		searchQuery?: string;
	} = $props();

	// ── Filter toggles ────────────────────────────────────────────────
	let showLlm = $state(true);
	let showCustom = $state(true);
	let showFileIo = $state(false);

	// ── Collapsed cards ───────────────────────────────────────────────
	let collapsedCards: Set<string> = $state(new Set());

	function toggleCard(id: string) {
		const next = new Set(collapsedCards);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsedCards = next;
	}

	// ── Child index (for breadcrumbs) ─────────────────────────────────
	const spanMap = $derived(new Map(spans.map((s) => [s.id, s])));

	function breadcrumb(span: Span): string[] {
		const parts: string[] = [];
		let current: Span | undefined = span;
		while (current?.parent_id) {
			current = spanMap.get(current.parent_id);
			if (current) parts.unshift(current.name);
		}
		return parts;
	}

	// ── Filtered + sorted spans ───────────────────────────────────────
	const filteredSpans = $derived.by(() => {
		const query = searchQuery.toLowerCase().trim();
		return spans
			.filter((s) => {
				const kind = s.kind?.type;
				if (kind === 'llm_call' && !showLlm) return false;
				if (kind === 'custom' && !showCustom) return false;
				if ((kind === 'fs_read' || kind === 'fs_write') && !showFileIo) return false;
				if (!kind && !showCustom) return false;

				if (query) {
					const name = s.name.toLowerCase();
					const kindLabel = kindName(s).toLowerCase();
					const inputText = extractText(s.input).toLowerCase();
					const outputText = extractText(s.output).toLowerCase();
					if (!name.includes(query) && !kindLabel.includes(query) && !inputText.includes(query) && !outputText.includes(query)) {
						return false;
					}
				}
				return true;
			})
			.sort((a, b) => new Date(spanStartedAt(a)).getTime() - new Date(spanStartedAt(b)).getTime());
	});

	// ── Counts by type ────────────────────────────────────────────────
	const counts = $derived.by(() => {
		let llm = 0, custom = 0, fileIo = 0;
		for (const s of spans) {
			const kind = s.kind?.type;
			if (kind === 'llm_call') llm++;
			else if (kind === 'fs_read' || kind === 'fs_write') fileIo++;
			else custom++;
		}
		return { llm, custom, fileIo };
	});

	// ── Chat message detection & rendering ────────────────────────────
	interface ChatMessage { role: string; content: string; }

	function extractMessages(value: unknown): ChatMessage[] | null {
		if (!value) return null;
		if (Array.isArray(value)) {
			if (value.length > 0 && value[0].role && value[0].content !== undefined) {
				return value as ChatMessage[];
			}
		}
		if (typeof value === 'object' && value !== null) {
			const obj = value as Record<string, unknown>;
			if (Array.isArray(obj.messages) && obj.messages.length > 0 && (obj.messages[0] as Record<string, unknown>).role) {
				return obj.messages as ChatMessage[];
			}
		}
		return null;
	}

	function roleColor(role: string): string {
		switch (role.toLowerCase()) {
			case 'system': return 'text-warning';
			case 'user': return 'text-accent';
			case 'assistant': return 'text-success';
			case 'tool': return 'text-purple-400';
			default: return 'text-text-secondary';
		}
	}

	function roleBgColor(role: string): string {
		switch (role.toLowerCase()) {
			case 'system': return 'bg-warning/5 border-warning/20';
			case 'user': return 'bg-accent/5 border-accent/20';
			case 'assistant': return 'bg-success/5 border-success/20';
			case 'tool': return 'bg-purple-400/5 border-purple-400/20';
			default: return 'bg-bg-tertiary border-border';
		}
	}

	// ── Helpers ────────────────────────────────────────────────────────
	function kindName(s: Span): string {
		if (!s.kind) return 'unknown';
		if (s.kind.type === 'custom') return s.kind.kind;
		return s.kind.type;
	}

	function formatDuration(ms: number | null): string {
		if (ms === null) return '...';
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(2)}s`;
	}

	function formatJson(value: unknown): string {
		if (value === null || value === undefined) return '(none)';
		if (typeof value === 'string') return value;
		return JSON.stringify(value, null, 2);
	}

	function extractText(value: unknown): string {
		if (!value) return '';
		if (typeof value === 'string') return value;
		return JSON.stringify(value);
	}

	// Collapsed messages per card
	let collapsedMessages: Set<string> = $state(new Set());

	function toggleMessage(key: string) {
		const next = new Set(collapsedMessages);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		collapsedMessages = next;
	}
</script>

<div class="flex flex-col h-full min-h-0">
	<!-- Filter bar -->
	<div class="flex items-center gap-3 px-3 py-1.5 border-b border-border shrink-0">
		<span class="text-[11px] text-text-muted">{filteredSpans.length} of {spans.length} spans</span>
		<div class="flex-1"></div>
		<div class="flex items-center gap-1 text-[10px]">
			<button
				class="px-2 py-0.5 rounded border transition-colors {showLlm ? 'bg-accent/15 text-accent border-accent/30' : 'text-text-muted border-border hover:text-text'}"
				onclick={() => showLlm = !showLlm}
			>LLM Calls <span class="opacity-60">{counts.llm}</span></button>
			<button
				class="px-2 py-0.5 rounded border transition-colors {showCustom ? 'bg-text-muted/10 text-text-secondary border-text-muted/30' : 'text-text-muted border-border hover:text-text'}"
				onclick={() => showCustom = !showCustom}
			>Custom <span class="opacity-60">{counts.custom}</span></button>
			<button
				class="px-2 py-0.5 rounded border transition-colors {showFileIo ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'text-text-muted border-border hover:text-text'}"
				onclick={() => showFileIo = !showFileIo}
			>File I/O <span class="opacity-60">{counts.fileIo}</span></button>
		</div>
	</div>

	<!-- Cards -->
	<div class="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
		{#if filteredSpans.length === 0}
			<div class="text-text-muted text-xs text-center py-12">No matching spans</div>
		{:else}
			{#each filteredSpans as span (span.id)}
				{@const duration = spanDurationMs(span)}
				{@const status = spanStatus(span)}
				{@const crumbs = breadcrumb(span)}
				{@const inputMsgs = extractMessages(span.input)}
				{@const outputMsgs = extractMessages(span.output)}
				{@const isCollapsed = collapsedCards.has(span.id)}
				{@const isLlm = span.kind?.type === 'llm_call'}

				<div class="border rounded-lg overflow-hidden transition-colors
					{selectedId === span.id ? 'border-accent/40 bg-accent/5' : 'border-border bg-bg-secondary'}">
					<!-- Card header -->
					<button
						class="w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-bg-tertiary/30"
						onclick={() => { onSelect?.(span); toggleCard(span.id); }}
					>
						<!-- Expand/collapse indicator -->
						<svg class="w-3 h-3 text-text-muted shrink-0 transition-transform {isCollapsed ? '' : 'rotate-90'}" fill="currentColor" viewBox="0 0 12 12">
							<path d="M4 2l6 4-6 4V2z"/>
						</svg>

						<SpanKindIcon {span} />
						<span class="text-sm font-medium text-text truncate">{span.name}</span>

						{#if isLlm && span.kind?.type === 'llm_call'}
							<span class="shrink-0 text-[10px] text-purple-400 bg-purple-400/10 rounded px-1.5 py-0.5">{span.kind.model}</span>
							{#if span.kind.input_tokens != null || span.kind.output_tokens != null}
								<span class="shrink-0 text-[10px] text-text-muted">
									{((span.kind.input_tokens ?? 0) + (span.kind.output_tokens ?? 0)).toLocaleString()} tok
								</span>
							{/if}
							{#if span.kind.cost != null}
								<span class="shrink-0 text-[10px] text-success">${span.kind.cost.toFixed(4)}</span>
							{/if}
						{/if}

						<div class="flex-1"></div>

						<StatusBadge {status} />
						<span class="text-xs text-text-secondary font-mono shrink-0">{formatDuration(duration)}</span>
					</button>

					{#if !isCollapsed}
						<!-- Breadcrumbs -->
						{#if crumbs.length > 0}
							<div class="px-4 pb-1 text-[10px] text-text-muted/60 flex items-center gap-1 flex-wrap">
								{#each crumbs as c, i}
									{#if i > 0}<span class="text-text-muted/30">&rsaquo;</span>{/if}
									<span>{c}</span>
								{/each}
								<span class="text-text-muted/30">&rsaquo;</span>
								<span class="text-text-muted">{span.name}</span>
							</div>
						{/if}

						<!-- Input -->
						{#if span.input !== undefined && span.input !== null}
							<div class="px-4 py-2 border-t border-border/50">
								<div class="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Input</div>
								{#if inputMsgs}
									<div class="space-y-1.5">
										{#each inputMsgs as msg, idx}
											{@const msgKey = `${span.id}-in-${idx}`}
											<div class="border rounded {roleBgColor(msg.role)}">
												<button
													class="w-full flex items-center gap-2 px-3 py-1 text-left"
													onclick={() => toggleMessage(msgKey)}
												>
													<span class="text-[10px] font-bold uppercase tracking-wider {roleColor(msg.role)}">{msg.role}</span>
													<div class="flex-1"></div>
													<span class="text-[10px] text-text-muted">{typeof msg.content === 'string' ? msg.content.length : 0} chars</span>
													<svg class="w-3 h-3 text-text-muted transition-transform {collapsedMessages.has(msgKey) ? '' : 'rotate-180'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
												</button>
												{#if !collapsedMessages.has(msgKey)}
													<div class="px-3 pb-2 text-xs text-text font-mono whitespace-pre-wrap break-words border-t border-inherit">
														<div class="pt-1.5">{typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}</div>
													</div>
												{/if}
											</div>
										{/each}
									</div>
								{:else}
									<pre class="text-xs text-text-secondary bg-bg-tertiary rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono break-words max-h-64 overflow-y-auto">{formatJson(span.input)}</pre>
								{/if}
							</div>
						{/if}

						<!-- Output -->
						{#if span.output !== undefined && span.output !== null}
							<div class="px-4 py-2 border-t border-border/50">
								<div class="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Output</div>
								{#if outputMsgs}
									<div class="space-y-1.5">
										{#each outputMsgs as msg, idx}
											{@const msgKey = `${span.id}-out-${idx}`}
											<div class="border rounded {roleBgColor(msg.role)}">
												<button
													class="w-full flex items-center gap-2 px-3 py-1 text-left"
													onclick={() => toggleMessage(msgKey)}
												>
													<span class="text-[10px] font-bold uppercase tracking-wider {roleColor(msg.role)}">{msg.role}</span>
													<div class="flex-1"></div>
													<span class="text-[10px] text-text-muted">{typeof msg.content === 'string' ? msg.content.length : 0} chars</span>
													<svg class="w-3 h-3 text-text-muted transition-transform {collapsedMessages.has(msgKey) ? '' : 'rotate-180'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
												</button>
												{#if !collapsedMessages.has(msgKey)}
													<div class="px-3 pb-2 text-xs text-text font-mono whitespace-pre-wrap break-words border-t border-inherit">
														<div class="pt-1.5">{typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}</div>
													</div>
												{/if}
											</div>
										{/each}
									</div>
								{:else}
									<pre class="text-xs text-text-secondary bg-bg-tertiary rounded p-3 overflow-x-auto whitespace-pre-wrap font-mono break-words max-h-64 overflow-y-auto">{formatJson(span.output)}</pre>
								{/if}
							</div>
						{/if}

						<!-- Error -->
						{#if status === 'failed'}
							{@const error = span.kind?.type === 'llm_call' ? null : null}
							<div class="px-4 py-2 bg-danger/5 border-t border-danger/20 text-danger text-xs">
								Span failed
							</div>
						{/if}
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>
