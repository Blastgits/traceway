<script lang="ts">
	import { page } from '$app/state';
	import {
		getEvalRun,
		cancelEvalRun,
		deleteEvalRun,
		subscribeEvents,
		shortId,
		listEvalRuns,
		type EvalRunDetailResponse,
		type EvalResult,
		type EvalRun
	} from '$lib/api';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import EvalScoreBadge from '$lib/components/EvalScoreBadge.svelte';
	import EvalProgressBar from '$lib/components/EvalProgressBar.svelte';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	const datasetId = $derived(page.params.id ?? '');
	const runId = $derived(page.params.runId ?? '');

	let run: EvalRun | null = $state(null);
	let results: EvalResult[] = $state([]);
	let loading = $state(true);
	let expandedRow: string | null = $state(null);
	let filterStatus: 'all' | 'passed' | 'failed' | 'errors' = $state('all');
	let deleteConfirm = $state(false);
	let allRuns: EvalRun[] = $state([]);

	const filteredResults = $derived.by(() => {
		if (filterStatus === 'all') return results;
		if (filterStatus === 'passed') return results.filter((r) => r.status === 'passed');
		if (filterStatus === 'failed') return results.filter((r) => r.status === 'failed');
		return results.filter((r) => r.status === 'error');
	});

	const statusCounts = $derived.by(() => ({
		all: results.length,
		passed: results.filter((r) => r.status === 'passed').length,
		failed: results.filter((r) => r.status === 'failed').length,
		errors: results.filter((r) => r.status === 'error').length
	}));

	const avgLatency = $derived.by(() => {
		const completed = results.filter((r) => r.latency_ms > 0);
		if (completed.length === 0) return null;
		return completed.reduce((sum, r) => sum + r.latency_ms, 0) / completed.length;
	});

	// Sparkline data derived from historical runs
	const scoreTrend = $derived.by(() => {
		return allRuns
			.filter((r) => r.results.scores.mean != null)
			.map((r) => r.results.scores.mean as number);
	});

	const passRateTrend = $derived.by(() => {
		return allRuns
			.filter((r) => r.results.scores.pass_rate != null)
			.map((r) => (r.results.scores.pass_rate as number) * 100);
	});

	const currentRunIndex = $derived.by(() => {
		if (!run) return -1;
		return allRuns.findIndex((r) => r.id === run!.id);
	});

	function sparklinePath(values: number[], width: number, height: number): string {
		if (values.length < 2) return '';
		const max = Math.max(...values);
		const min = Math.min(...values);
		const range = max - min || 1;
		const stepX = width / (values.length - 1);
		return values
			.map((v, i) => {
				const x = i * stepX;
				const y = height - ((v - min) / range) * height;
				return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
			})
			.join(' ');
	}

	function sparklineDot(
		values: number[],
		index: number,
		width: number,
		height: number
	): { x: number; y: number } | null {
		if (index < 0 || index >= values.length || values.length < 2) return null;
		const max = Math.max(...values);
		const min = Math.min(...values);
		const range = max - min || 1;
		const stepX = width / (values.length - 1);
		const x = index * stepX;
		const y = height - ((values[index] - min) / range) * height;
		return { x, y };
	}

	async function load() {
		try {
			const resp = await getEvalRun(runId);
			// EvalRunDetailResponse is flattened — the run fields are at top level
			const { result_items, ...runData } = resp;
			run = runData as EvalRun;
			results = result_items;
		} catch {
			// not found
		}
		loading = false;

		// Fetch all completed runs for sparkline trends
		const runsResp = await listEvalRuns(datasetId).catch(() => ({ items: [] as EvalRun[] }));
		allRuns = runsResp.items
			.filter((r) => r.status === 'completed')
			.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
	}

	onMount(() => {
		load();

		const unsub = subscribeEvents((event) => {
			if (event.type === 'eval_run_updated' && event.run.id === runId) {
				run = event.run;
				// Reload to get updated results
				getEvalRun(runId)
					.then((resp) => {
						const { result_items, ...runData } = resp;
						run = runData as EvalRun;
						results = result_items;
					})
					.catch(() => {});
			} else if (event.type === 'eval_run_completed' && event.run.id === runId) {
				run = event.run;
				getEvalRun(runId)
					.then((resp) => {
						const { result_items, ...runData } = resp;
						run = runData as EvalRun;
						results = result_items;
					})
					.catch(() => {});
			}
		});

		return unsub;
	});

	async function handleCancel() {
		try {
			await cancelEvalRun(runId);
			if (run) run = { ...run, status: 'cancelled' };
		} catch {
			// error
		}
	}

	async function handleDelete() {
		if (!deleteConfirm) {
			deleteConfirm = true;
			return;
		}
		try {
			await deleteEvalRun(runId);
			goto(`/datasets/${datasetId}`);
		} catch {
			// error
		}
	}

	function formatLatency(ms: number): string {
		if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
		return `${ms}ms`;
	}

	function formatJson(value: unknown): string {
		if (value === null || value === undefined) return '(none)';
		if (typeof value === 'string') return value;
		return JSON.stringify(value, null, 2);
	}

	function truncate(s: string, len: number): string {
		return s.length > len ? s.slice(0, len) + '...' : s;
	}

	function durationStr(): string {
		if (!run) return '';
		if (!run.completed_at) {
			const elapsed = Date.now() - new Date(run.created_at).getTime();
			const secs = Math.floor(elapsed / 1000);
			if (secs < 60) return `${secs}s`;
			return `${Math.floor(secs / 60)}m ${secs % 60}s`;
		}
		const dur = new Date(run.completed_at).getTime() - new Date(run.created_at).getTime();
		const secs = Math.floor(dur / 1000);
		if (secs < 60) return `${secs}s`;
		return `${Math.floor(secs / 60)}m ${secs % 60}s`;
	}

	function rowBorderClass(status: string): string {
		if (status === 'passed') return 'border-l-2 border-l-success';
		if (status === 'failed') return 'border-l-2 border-l-danger';
		return 'border-l-2 border-l-warning';
	}
</script>

<div class="app-shell-wide space-y-4">
	<div class="grid grid-cols-1 lg:grid-cols-[170px_minmax(0,1fr)] gap-4 items-start">
		<aside class="hidden lg:block">
			<div class="app-toolbar-shell rounded-xl p-2 space-y-1 sticky top-18">
				<a
					href="/datasets/{datasetId}"
					class="block px-2 py-1.5 text-xs rounded-lg border border-border/70 bg-bg-tertiary/60 text-text"
					>Dataset</a
				>
				<a
					href="/datasets/{datasetId}?tab=evals"
					class="block px-2 py-1.5 text-xs rounded-lg text-text-muted hover:text-text hover:bg-bg-tertiary/35 transition-colors"
					>Eval runs</a
				>
				<div class="px-2 py-1.5 text-xs rounded-lg bg-bg-tertiary/40 text-text">
					Run details
				</div>
			</div>
		</aside>

		<div class="space-y-4">
			<!-- Header -->
			<div class="flex items-center justify-between">
				<a
					href="/datasets/{datasetId}"
					class="text-text-secondary hover:text-text text-sm">&larr; Back to dataset</a
				>
				{#if run}
					<div class="flex items-center gap-2">
						{#if run.status === 'running'}
							<button
								class="px-3 py-1.5 text-xs bg-warning/10 text-warning border border-warning/20 rounded hover:bg-warning/20 transition-colors"
								onclick={handleCancel}>Cancel Run</button
							>
						{/if}
						<button
							class="px-3 py-1.5 text-xs bg-danger/10 text-danger border border-danger/20 rounded hover:bg-danger/20 transition-colors"
							onclick={handleDelete}
							>{deleteConfirm ? 'Confirm Delete' : 'Delete'}</button
						>
					</div>
				{/if}
			</div>

			{#if loading}
				<div class="text-text-muted text-sm text-center py-8">Loading...</div>
			{:else if !run}
				<div class="text-text-muted text-sm text-center py-8">Eval run not found</div>
			{:else}
				<!-- Run info -->
				<div>
					<h1 class="text-lg font-bold">{run.name ?? run.config.model}</h1>
					<div class="text-xs text-text-muted mt-1 flex items-center gap-2 flex-wrap">
						<span
							>Model: <span class="text-purple-400">{run.config.model}</span></span
						>
						{#if run.config.provider}
							<span>&middot;</span>
							<span>Provider: {run.config.provider}</span>
						{/if}
						<span>&middot;</span>
						<span>Scoring: {run.scoring}</span>
						<span>&middot;</span>
						<span>Started: {new Date(run.created_at).toLocaleString()}</span>
						<span>&middot;</span>
						<span>Duration: {durationStr()}</span>
					</div>
				</div>

				<!-- Stats cards with sparklines -->
				<div class="grid grid-cols-4 gap-3">
					<div class="bg-bg-secondary border border-border rounded-md p-3">
						<div class="text-xs text-text-muted uppercase mb-1">Score</div>
						<div class="flex items-center justify-between gap-2">
							<div class="text-xl font-mono">
								<EvalScoreBadge score={run.results.scores.mean} />
							</div>
							{#if scoreTrend.length >= 2}
								{@const w = 120}
								{@const h = 24}
								{@const path = sparklinePath(scoreTrend, w, h)}
								{@const dot = sparklineDot(scoreTrend, currentRunIndex, w, h)}
								<svg
									width={w}
									height={h + 4}
									viewBox={`0 -2 ${w} ${h + 4}`}
									class="text-purple-400 shrink-0"
								>
									<path d={path} fill="none" stroke="currentColor" stroke-width="1.5" />
									{#if dot}
										<circle
											cx={dot.x}
											cy={dot.y}
											r="3"
											fill="currentColor"
										/>
									{/if}
								</svg>
							{/if}
						</div>
					</div>
					<div class="bg-bg-secondary border border-border rounded-md p-3">
						<div class="text-xs text-text-muted uppercase mb-1">Pass Rate</div>
						<div class="flex items-center justify-between gap-2">
							<div class="text-xl font-mono text-text">
								{run.results.scores.pass_rate != null
									? `${Math.round(run.results.scores.pass_rate * 100)}%`
									: '\u2014'}
							</div>
							{#if passRateTrend.length >= 2}
								{@const w = 120}
								{@const h = 24}
								{@const path = sparklinePath(passRateTrend, w, h)}
								{@const dot = sparklineDot(passRateTrend, currentRunIndex, w, h)}
								<svg
									width={w}
									height={h + 4}
									viewBox={`0 -2 ${w} ${h + 4}`}
									class="text-purple-400 shrink-0"
								>
									<path d={path} fill="none" stroke="currentColor" stroke-width="1.5" />
									{#if dot}
										<circle
											cx={dot.x}
											cy={dot.y}
											r="3"
											fill="currentColor"
										/>
									{/if}
								</svg>
							{/if}
						</div>
					</div>
					<div class="bg-bg-secondary border border-border rounded-md p-3">
						<div class="text-xs text-text-muted uppercase mb-1">Completed</div>
						<div class="text-xl font-mono text-text">
							{run.results.completed}/{run.results.total}
						</div>
					</div>
					<div class="bg-bg-secondary border border-border rounded-md p-3">
						<div class="text-xs text-text-muted uppercase mb-1">Avg Latency</div>
						<div class="text-xl font-mono text-text">
							{avgLatency != null ? formatLatency(avgLatency) : '\u2014'}
						</div>
					</div>
				</div>

				<!-- Progress bar if running -->
				{#if run.status === 'running'}
					<div class="flex items-center gap-3">
						<span class="text-sm text-text-secondary">Running...</span>
						<div class="flex-1">
							<EvalProgressBar
								completed={run.results.completed}
								total={run.results.total}
							/>
						</div>
						<span class="text-sm text-text-secondary">
							{run.results.total > 0
								? Math.round((run.results.completed / run.results.total) * 100)
								: 0}%
						</span>
					</div>
				{/if}

				<!-- Filter pills -->
				<div
					class="app-toolbar-shell rounded-xl p-2 flex items-center gap-1.5 flex-wrap"
				>
					<button
						class="query-chip {filterStatus === 'all' ? 'query-chip-active' : ''}"
						onclick={() => (filterStatus = 'all')}>All ({statusCounts.all})</button
					>
					<button
						class="query-chip {filterStatus === 'passed' ? 'query-chip-active' : ''}"
						onclick={() => (filterStatus = 'passed')}
						>Passed ({statusCounts.passed})</button
					>
					<button
						class="query-chip {filterStatus === 'failed' ? 'query-chip-active' : ''}"
						onclick={() => (filterStatus = 'failed')}
						>Failed ({statusCounts.failed})</button
					>
					<button
						class="query-chip {filterStatus === 'errors' ? 'query-chip-active' : ''}"
						onclick={() => (filterStatus = 'errors')}
						>Errors ({statusCounts.errors})</button
					>
				</div>

				<!-- Results table -->
				<div class="table-float">
					<div
						class="grid grid-cols-[auto_minmax(200px,1fr)_minmax(200px,1fr)_80px_80px] gap-3 px-3 py-2 text-xs text-text-muted uppercase items-center"
					>
						<span class="w-5"></span>
						<span>Input</span>
						<span>Output</span>
						<span>Score</span>
						<span>Latency</span>
					</div>

					{#if filteredResults.length === 0}
						<div class="text-text-muted text-sm text-center py-8">
							{results.length === 0
								? 'No results yet'
								: 'No results match this filter'}
						</div>
					{:else}
						<div class="space-y-0">
							{#each filteredResults as result (result.id)}
								<div
									class="border-b border-border/50 hover:bg-bg-secondary transition-colors cursor-pointer {rowBorderClass(result.status)}"
									role="button"
									tabindex={0}
									aria-label={`Toggle eval result ${shortId(result.id)}`}
									onclick={() =>
										(expandedRow =
											expandedRow === result.id ? null : result.id)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											expandedRow =
												expandedRow === result.id ? null : result.id;
										}
									}}
								>
									<div
										class="grid grid-cols-[auto_minmax(200px,1fr)_minmax(200px,1fr)_80px_80px] gap-3 items-center px-3 py-2 text-sm"
									>
										<!-- Pass/fail icon -->
										<span class="w-5 flex items-center justify-center">
											{#if result.status === 'passed'}
												<svg
													class="w-4 h-4 text-success"
													viewBox="0 0 20 20"
													fill="currentColor"
												>
													<path
														fill-rule="evenodd"
														d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
														clip-rule="evenodd"
													/>
												</svg>
											{:else if result.status === 'failed'}
												<svg
													class="w-4 h-4 text-danger"
													viewBox="0 0 20 20"
													fill="currentColor"
												>
													<path
														fill-rule="evenodd"
														d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
														clip-rule="evenodd"
													/>
												</svg>
											{:else}
												<svg
													class="w-4 h-4 text-warning"
													viewBox="0 0 20 20"
													fill="currentColor"
												>
													<path
														fill-rule="evenodd"
														d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
														clip-rule="evenodd"
													/>
												</svg>
											{/if}
										</span>
										<span
											class="text-text-secondary text-xs truncate font-mono"
											>{truncate(formatJson(result.actual_output), 100)}</span
										>
										<div class="text-xs">
											<span
												class="text-text-secondary truncate font-mono block"
												>{truncate(
													formatJson(result.actual_output),
													100
												)}</span
											>
										</div>
										<div>
											{#if result.status === 'error'}
												<span
													class="text-xs px-1.5 py-0.5 bg-warning/20 text-warning border border-warning/30 rounded"
													>err</span
												>
											{:else}
												<EvalScoreBadge
													score={result.score}
													size="xs"
												/>
											{/if}
										</div>
										<span class="text-xs text-text-muted font-mono"
											>{result.latency_ms > 0
												? formatLatency(result.latency_ms)
												: '\u2014'}</span
										>
									</div>

									<!-- Expanded view -->
									{#if expandedRow === result.id}
										<div class="px-3 pb-3 space-y-3 bg-bg-secondary">
											<div class="grid grid-cols-2 gap-3">
												<div>
													<div
														class="text-xs text-text-muted uppercase mb-1"
													>
														Full Input
													</div>
													<pre
														class="text-xs bg-bg-tertiary rounded-md p-2 overflow-auto max-h-48 font-mono text-text-secondary whitespace-pre-wrap">{formatJson(result.actual_output)}</pre>
												</div>
												<div>
													<div
														class="text-xs text-text-muted uppercase mb-1"
													>
														Full Output
													</div>
													<pre
														class="text-xs bg-bg-tertiary rounded-md p-2 overflow-auto max-h-48 font-mono text-text-secondary whitespace-pre-wrap">{formatJson(result.actual_output)}</pre>
												</div>
											</div>

											<div class="grid grid-cols-2 gap-3">
												{#if result.score != null}
													<div>
														<div
															class="text-xs text-text-muted uppercase mb-1"
														>
															Score
														</div>
														<div
															class="text-sm font-mono flex items-center gap-2"
														>
															<EvalScoreBadge
																score={result.score}
																size="xs"
															/>
															{#if result.score_reason}
																<span
																	class="text-text-secondary text-xs"
																	>&mdash;
																	{result.score_reason}</span
																>
															{/if}
														</div>
													</div>
												{/if}
												{#if result.score_reason && result.score == null}
													<div>
														<div
															class="text-xs text-text-muted uppercase mb-1"
														>
															Score Reason
														</div>
														<pre
															class="text-xs bg-bg-tertiary rounded-md p-2 overflow-auto max-h-48 font-mono text-text-secondary whitespace-pre-wrap">{result.score_reason}</pre>
													</div>
												{/if}
											</div>

											<div
												class="flex items-center gap-4 text-xs text-text-muted flex-wrap"
											>
												{#if result.input_tokens}
													<span
														class="bg-bg-tertiary px-2 py-0.5 rounded"
														>Input tokens: <span
															class="text-text-secondary font-mono"
															>{result.input_tokens}</span
														></span
													>
												{/if}
												{#if result.output_tokens}
													<span
														class="bg-bg-tertiary px-2 py-0.5 rounded"
														>Output tokens: <span
															class="text-text-secondary font-mono"
															>{result.output_tokens}</span
														></span
													>
												{/if}
												{#if result.latency_ms > 0}
													<span
														class="bg-bg-tertiary px-2 py-0.5 rounded"
														>Latency: <span
															class="text-text-secondary font-mono"
															>{formatLatency(
																result.latency_ms
															)}</span
														></span
													>
												{/if}
												<span class="bg-bg-tertiary px-2 py-0.5 rounded"
													>Datapoint: <span
														class="text-text-secondary font-mono"
														>{shortId(
															result.datapoint_id
														)}</span
													></span
												>
											</div>

											{#if result.error}
												<div
													class="bg-danger/10 border border-danger/20 rounded-md p-2"
												>
													<div
														class="text-xs text-danger uppercase mb-1"
													>
														Error
													</div>
													<pre
														class="text-xs font-mono text-danger whitespace-pre-wrap">{result.error}</pre>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
