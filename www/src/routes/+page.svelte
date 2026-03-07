<script lang="ts">
	import InView from '$lib/InView.svelte';

	let scrollY = $state(0);

	// Code tab state
	let activeTab = $state('Python');
	const codeTabs = ['Python', 'TypeScript', 'cURL'];

	const codeExamples: Record<string, string[]> = {
		Python: [
			'<span class="syn-c"># Trace every LLM call automatically</span>',
			'<span class="syn-kw">from</span> traceway <span class="syn-kw">import</span> Traceway',
			'',
			'tw = Traceway()',
			'<span class="syn-kw">with</span> tw.trace(<span class="syn-s">"customer-support"</span>) <span class="syn-kw">as</span> trace:',
			'    <span class="syn-c"># Use regular Python — no special syntax</span>',
			'    <span class="syn-kw">with</span> trace.span(<span class="syn-s">"rewrite-query"</span>, kind=<span class="syn-s">"llm_call"</span>):',
			'        query = rewrite(user_input)',
			'',
			'    <span class="syn-kw">with</span> trace.span(<span class="syn-s">"search-kb"</span>, kind=<span class="syn-s">"custom"</span>):',
			'        docs = search(query)',
			'',
			'    <span class="syn-kw">with</span> trace.span(<span class="syn-s">"generate"</span>, model=<span class="syn-s">"gpt-4o"</span>):',
			'        answer = generate(query, docs)',
			'',
			'    <span class="syn-kw">return</span> answer',
		],
		TypeScript: [
			'<span class="syn-c">// Trace every LLM call automatically</span>',
			'<span class="syn-kw">import</span> { Traceway } <span class="syn-kw">from</span> <span class="syn-s">"traceway"</span>;',
			'',
			'<span class="syn-kw">const</span> tw = <span class="syn-kw">new</span> Traceway();',
			'<span class="syn-kw">const</span> trace = tw.startTrace(<span class="syn-s">"customer-support"</span>);',
			'',
			'<span class="syn-kw">const</span> query = <span class="syn-kw">await</span> trace.span(<span class="syn-s">"rewrite-query"</span>, <span class="syn-kw">async</span> () =&gt; {',
			'  <span class="syn-kw">return</span> rewrite(userInput);',
			'});',
			'',
			'<span class="syn-kw">const</span> docs = <span class="syn-kw">await</span> trace.span(<span class="syn-s">"search-kb"</span>, <span class="syn-kw">async</span> () =&gt; {',
			'  <span class="syn-kw">return</span> search(query);',
			'});',
			'',
			'<span class="syn-kw">const</span> answer = <span class="syn-kw">await</span> trace.span(<span class="syn-s">"generate"</span>, <span class="syn-kw">async</span> () =&gt; {',
			'  <span class="syn-kw">return</span> generate(query, docs);',
			'});',
		],
		cURL: [
			'<span class="syn-c"># Point your LLM base_url at the Traceway proxy</span>',
			'<span class="syn-c"># Zero code changes — traces captured automatically</span>',
			'',
			'curl http://localhost:3001/v1/chat/completions \\',
			'  -H <span class="syn-s">"Content-Type: application/json"</span> \\',
			'  -d <span class="syn-s">\'{</span>',
			'<span class="syn-s">    "model": "gpt-4o",</span>',
			'<span class="syn-s">    "messages": [</span>',
			'<span class="syn-s">      {"role": "user", "content": "Hello"}</span>',
			'<span class="syn-s">    ]</span>',
			'<span class="syn-s">  }\'</span>',
			'',
			'<span class="syn-c"># View traces at http://localhost:3000</span>',
		],
	};

	// Use case categories
	let activeCategory = $state(0);
	const categories = [
		{
			name: 'Debugging',
			pills: ['Trace Explorer', 'Span Waterfall', 'Input/Output Inspector', 'Error Tracking'],
		},
		{
			name: 'Cost & Usage',
			pills: ['Token Counting', 'Cost Attribution', 'Model Comparison', 'Usage Trends'],
		},
		{
			name: 'Datasets',
			pills: ['Span Export', 'CSV Import', 'Review Queue', 'Labeling'],
		},
	];
</script>

<svelte:window bind:scrollY />

<style>
	/* Syntax highlighting */
	:global(.syn-c) { color: rgba(136, 140, 170, 0.5); }
	:global(.syn-kw) { color: #c792ea; }
	:global(.syn-s) { color: #c3e88d; }

	@keyframes span-grow {
		from { transform: scaleX(0); }
		to { transform: scaleX(1); }
	}
	.span-bar {
		transform-origin: left;
		animation: span-grow 0.7s cubic-bezier(0.22, 1, 0.36, 1) var(--d, 0s) both;
	}

	/* Strikethrough */
	@keyframes strike {
		from { width: 0; }
		to { width: 100%; }
	}
	.strike-through {
		position: relative;
	}
	.strike-through::after {
		content: '';
		position: absolute;
		left: 0;
		top: 50%;
		height: 3px;
		background: var(--color-accent);
		border-radius: 2px;
		width: 0;
		animation: strike 0.5s ease-out 1s forwards;
	}

	@keyframes glow-pulse {
		0%, 100% { opacity: 0.025; }
		50% { opacity: 0.05; }
	}

	/* Scan line for product visual */
	@keyframes scan {
		0% { left: 0%; opacity: 0; }
		5% { opacity: 0.4; }
		95% { opacity: 0.4; }
		100% { left: 100%; opacity: 0; }
	}
</style>

<!-- ═══════════════════════════════════════════════════ -->
<!-- NAV — floating pill, Restate style                  -->
<!-- ═══════════════════════════════════════════════════ -->
<nav class="fixed top-0 left-0 right-0 z-50 flex justify-center pt-3 px-4">
	<div class="w-full max-w-[1100px] flex items-center justify-between gap-4 bg-bg-secondary/80 backdrop-blur-xl border border-border/50 rounded-2xl px-5 py-2.5 shadow-lg shadow-black/20">
		<a href="/" class="font-mono text-[14px] tracking-tight text-text/90 font-medium shrink-0">
			traceway
		</a>
		<div class="hidden md:flex items-center gap-6">
			<a href="#features" class="text-[13px] text-text-secondary hover:text-text transition-colors">Features</a>
			<a href="#setup" class="text-[13px] text-text-secondary hover:text-text transition-colors">Setup</a>
			<a href="#pricing" class="text-[13px] text-text-secondary hover:text-text transition-colors">Pricing</a>
		</div>
		<div class="flex items-center gap-3">
			<a
				href="https://github.com/blastgits/traceway"
				target="_blank"
				rel="noopener"
				class="hidden sm:inline-flex items-center gap-1.5 text-[12px] text-text-secondary border border-border/50 rounded-xl px-3 py-1.5 hover:bg-bg-tertiary transition-colors"
			>
				<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
				GitHub
			</a>
			<a href="https://platform.traceway.ai/login" class="hidden sm:inline text-[12px] text-text-secondary hover:text-text transition-colors px-2 py-1.5">Cloud Login</a>
			<a
				href="https://platform.traceway.ai/signup"
				class="text-[12px] font-semibold bg-accent text-bg rounded-xl px-4 py-1.5 hover:brightness-110 transition-all shadow-sm"
			>
				Get Started
			</a>
		</div>
	</div>
</nav>

<!-- ═══════════════════════════════════════════════════ -->
<!-- HERO — centered, massive headline                   -->
<!-- ═══════════════════════════════════════════════════ -->
<section class="relative pt-36 md:pt-44 pb-16 md:pb-20 overflow-hidden">
	<!-- BG glow -->
	<div class="absolute top-[10%] left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full blur-[250px]" style="background: var(--color-accent); animation: glow-pulse 8s ease-in-out infinite;"></div>

	<div class="relative max-w-[900px] mx-auto px-6 text-center">
		<!-- Announcement pill -->
		<InView>
			<a
				href="https://github.com/blastgits/traceway"
				target="_blank"
				rel="noopener"
				class="inline-flex items-center gap-2 rounded-full border border-border/50 bg-bg-secondary/60 backdrop-blur-sm pl-1.5 pr-4 py-1 mb-10 hover:border-accent/30 transition-colors group"
			>
				<span class="text-[11px] font-semibold bg-accent text-bg rounded-full px-2.5 py-0.5">Open Source</span>
				<span class="text-[12px] text-text-secondary">LLM observability for every team</span>
				<svg class="w-3 h-3 text-text-muted group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
			</a>
		</InView>

		<!-- Headline -->
		<InView>
			<h1 class="text-[clamp(2.8rem,7vw,5.5rem)] font-bold leading-[1.05] tracking-tight">
				See <span class="text-transparent bg-clip-text bg-gradient-to-r from-accent via-emerald-300 to-accent">inside</span> every
				AI call your app makes.
			</h1>
		</InView>

		<!-- Subtitle -->
		<InView delay={80}>
			<p class="text-[17px] md:text-xl text-text-secondary leading-relaxed mt-8 max-w-2xl mx-auto">
				Traceway captures traces, tokens, cost, and latency from any LLM provider. Focus on your product, not your logging.
			</p>
		</InView>

		<!-- CTAs -->
		<InView delay={160}>
			<div class="flex items-center justify-center gap-3 mt-10">
				<a
					href="https://platform.traceway.ai/signup"
					class="inline-flex items-center gap-2 bg-accent text-bg font-semibold text-sm px-6 py-2.5 rounded-xl hover:brightness-110 hover:shadow-[0_0_40px_rgba(110,231,183,0.2)] transition-all shadow-sm"
				>
					Get Started
					<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
				</a>
				<a
					href="https://github.com/blastgits/traceway"
					target="_blank"
					rel="noopener"
					class="inline-flex items-center gap-2 text-sm text-text bg-bg-secondary border border-border/60 rounded-xl px-6 py-2.5 hover:bg-bg-tertiary transition-all shadow-sm"
				>
					<svg class="w-4 h-4 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
					Read Docs
				</a>
			</div>
		</InView>
	</div>
</section>

<!-- ═══════════════════════════════════════════════════ -->
<!-- CATEGORY TABS + CODE BLOCK                          -->
<!-- ═══════════════════════════════════════════════════ -->
<section class="pb-20 md:pb-32">
	<div class="max-w-[900px] mx-auto px-6">
		<!-- Category row -->
		<div class="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 mb-8">
			{#each categories as cat, ci}
				<div class="flex items-center gap-2.5">
					<button
						class="text-[13px] font-medium transition-colors {activeCategory === ci ? 'text-text' : 'text-text-muted/40 hover:text-text-muted/70'}"
						onclick={() => activeCategory = ci}
					>
						{cat.name}
					</button>
					{#if activeCategory === ci}
						<div class="hidden md:flex items-center gap-1.5">
							{#each cat.pills as pill}
								<span class="text-[11px] text-text-secondary/80 border border-border/40 rounded-full px-2.5 py-0.5 bg-bg-secondary/50">{pill}</span>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Code block with language tabs -->
		<div>
			<!-- Tabs row -->
			<div class="flex items-center border-b border-border/40">
				{#each codeTabs as tab}
					<button
						class="text-[12px] font-mono px-4 py-2 transition-colors relative {activeTab === tab ? 'text-text' : 'text-text-muted/40 hover:text-text-muted/70'}"
						onclick={() => activeTab = tab}
					>
						{tab}
						{#if activeTab === tab}
							<div class="absolute bottom-0 left-0 right-0 h-[2px] bg-accent rounded-full"></div>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Code -->
			<div class="rounded-b-2xl border border-t-0 border-border/40 bg-[#0d0d14] overflow-hidden">
				<div class="p-6 font-mono text-[13px] leading-[1.75] overflow-x-auto">
					{#key activeTab}
						{#each codeExamples[activeTab] as line, i}
							<div class="flex">
								<span class="w-8 shrink-0 text-right pr-4 select-none text-text-muted/20 text-[12px]">{i + 1}</span>
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								<span class="text-text/70">{@html line || '&ZeroWidthSpace;'}</span>
							</div>
						{/each}
					{/key}
				</div>
			</div>
		</div>
	</div>
</section>

<!-- ═══════════════════════════════════════════════════ -->
<!-- VALUE PROP — centered headline + strikethrough       -->
<!-- ═══════════════════════════════════════════════════ -->
<section id="features" class="pt-12 md:pt-20 pb-20 md:pb-32">
	<div class="max-w-[900px] mx-auto px-6 text-center">
		<InView>
			<h2 class="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-tight leading-[1.15]">
				Debug every AI call without<br class="hidden md:inline" />
				<span class="strike-through">print statements</span> guessing
			</h2>
		</InView>

		<InView delay={80}>
			<p class="text-[16px] md:text-lg text-text-secondary leading-relaxed mt-6 max-w-2xl mx-auto">
				Traceway gives you structured tracing, cost tracking, and a real-time dashboard all in one. Your AI pipelines become observable and debuggable, end-to-end.
			</p>
		</InView>
	</div>
</section>

<!-- ═══════════════════════════════════════════════════ -->
<!-- PRODUCT VISUAL — big dashboard mock                 -->
<!-- ═══════════════════════════════════════════════════ -->
<section class="pb-20 md:pb-32">
	<div class="max-w-[1000px] mx-auto px-6">
		<InView>
			<div class="relative">
				<!-- Glow -->
				<div class="absolute -inset-20 bg-accent/[0.025] blur-[120px] rounded-full pointer-events-none"></div>

				<div class="relative rounded-2xl border border-border/50 bg-bg-secondary/80 overflow-hidden shadow-2xl shadow-black/30">
					<!-- Window chrome — macOS style -->
					<div class="px-4 py-3 border-b border-border/30 flex items-center">
						<div class="flex gap-2">
							<div class="h-3 w-3 rounded-full bg-[#ff5f57]/70"></div>
							<div class="h-3 w-3 rounded-full bg-[#febc2e]/70"></div>
							<div class="h-3 w-3 rounded-full bg-[#28c840]/70"></div>
						</div>
						<div class="flex-1 text-center">
							<span class="font-mono text-[11px] text-text-muted/30">localhost:3000</span>
						</div>
						<div class="w-14"></div>
					</div>

					<!-- App nav -->
					<div class="px-5 py-2.5 border-b border-border/25 flex items-center justify-between">
						<div class="flex items-center gap-5 text-[12px]">
							<span class="font-mono text-text-muted/30 text-[11px]">traceway</span>
							<span class="text-text font-medium border-b-2 border-accent pb-2.5 -mb-[11px]">Traces</span>
							<span class="text-text-muted/40">Files</span>
							<span class="text-text-muted/40">Analytics</span>
							<span class="text-text-muted/40">Datasets</span>
						</div>
						<div class="flex items-center gap-3">
							<div class="flex items-center gap-1.5 border border-border/25 rounded-lg px-2.5 py-1">
								<svg class="w-3 h-3 text-text-muted/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
								<span class="text-[10px] text-text-muted/20 font-mono">Search...</span>
							</div>
							<span class="flex items-center gap-1.5 text-[10px] text-accent/60 font-mono">
								<span class="h-1.5 w-1.5 rounded-full bg-accent/80 animate-pulse"></span>
								LIVE
							</span>
						</div>
					</div>

					<!-- Expanded trace -->
					<div class="px-5 py-3 border-b border-border/20 flex items-center justify-between bg-accent/[0.015]">
						<div class="flex items-center gap-2.5">
							<svg class="w-3 h-3 text-text-muted/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
							<span class="font-mono text-[12px] text-text/80">customer-support-bot</span>
						</div>
						<div class="flex items-center gap-5 font-mono text-[10px] text-text-muted/40">
							<span>4 spans</span>
							<span>2.3s</span>
							<span>$0.043</span>
							<span>2s ago</span>
						</div>
					</div>

					<!-- Waterfall -->
					<div class="px-5 py-4 space-y-2 border-b border-border/15">
						{#each [
							{ name: 'rewrite-query', w: 18, x: 0, c: 'bg-purple-400/25', ms: '180ms', d: 0 },
							{ name: 'search-kb', w: 10, x: 19, c: 'bg-cyan-400/25', ms: '92ms', d: 0.12, bad: true },
							{ name: 'build-context', w: 5, x: 30, c: 'bg-text-muted/15', ms: '45ms', d: 0.24 },
							{ name: 'generate', w: 62, x: 36, c: 'bg-accent/20', ms: '1.8s', d: 0.36 },
						] as bar}
							<div class="flex items-center gap-3">
								<span class="font-mono text-[10px] text-text-muted/35 w-24 shrink-0 text-right truncate">{bar.name}</span>
								<div class="flex-1 h-5 relative bg-white/[0.01] rounded-sm">
									<div
										class="span-bar absolute top-0 h-full rounded-sm {bar.c} {bar.bad ? 'ring-1 ring-red-400/25' : ''}"
										style="left: {bar.x}%; width: {bar.w}%; --d: {bar.d}s;"
									></div>
									{#if bar.bad}
										<span class="absolute -top-3.5 text-[8px] font-mono text-red-400/40" style="left: {bar.x}%;">
											wrong doc returned
										</span>
									{/if}
								</div>
								<span class="font-mono text-[10px] text-text-muted/25 w-10 shrink-0 text-right">{bar.ms}</span>
							</div>
						{/each}
					</div>

					<!-- I/O row -->
					<div class="px-5 py-3 border-b border-border/15 grid grid-cols-2 gap-6">
						<div>
							<div class="text-[9px] uppercase tracking-wider text-text-muted/25 mb-1 font-mono">Input</div>
							<div class="font-mono text-[10px] text-text/40 truncate">"How do I reset my password?"</div>
						</div>
						<div>
							<div class="text-[9px] uppercase tracking-wider text-text-muted/25 mb-1 font-mono">Output</div>
							<div class="font-mono text-[10px] text-text/40 truncate">"To reset your password, navigate to Settings &gt; Account..."</div>
						</div>
					</div>

					<!-- More traces (collapsed) -->
					{#each [
						{ name: 'email-drafting-agent', spans: '7', time: '4.1s', cost: '$0.089', age: '12s ago' },
						{ name: 'code-review-bot', spans: '3', time: '1.8s', cost: '$0.021', age: '45s ago' },
						{ name: 'data-extraction', spans: '5', time: '3.2s', cost: '$0.056', age: '1m ago' },
					] as trace}
						<div class="px-5 py-2.5 border-b border-border/10 flex items-center justify-between">
							<div class="flex items-center gap-2.5">
								<svg class="w-3 h-3 text-text-muted/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
								<span class="font-mono text-[11px] text-text-muted/40">{trace.name}</span>
							</div>
							<div class="flex items-center gap-5 font-mono text-[10px] text-text-muted/25">
								<span>{trace.spans} spans</span>
								<span>{trace.time}</span>
								<span>{trace.cost}</span>
								<span>{trace.age}</span>
							</div>
						</div>
					{/each}

					<!-- Scan line -->
					<div class="absolute w-px h-full top-0 bg-gradient-to-b from-transparent via-accent/15 to-transparent pointer-events-none" style="animation: scan 6s linear infinite;"></div>
				</div>
			</div>
		</InView>
	</div>
</section>

<!-- ═══════════════════════════════════════════════════ -->
<!-- FEATURES — 3-col grid cards                         -->
<!-- ═══════════════════════════════════════════════════ -->
<section class="py-20 md:py-32">
	<div class="max-w-[1000px] mx-auto px-6">
		<div class="grid grid-cols-1 md:grid-cols-3 gap-5">
			{#each [
				{ color: 'text-accent', label: 'Trace Capture', title: 'Every call. Every span.', desc: 'Nested spans for RAG pipelines, agent loops, tool calls. See inputs, outputs, latency, and cost at every step.' },
				{ color: 'text-purple-400', label: 'Any Provider', title: 'OpenAI, Anthropic, Ollama.', desc: 'Transparent proxy — point your base_url at Traceway. Traces captured automatically. Zero code changes.' },
				{ color: 'text-cyan-400', label: 'Cost Tracking', title: 'Know what you spend.', desc: 'Per-model token counts, per-span cost. No more surprise bills from runaway agent loops.' },
				{ color: 'text-amber-400', label: 'File Versioning', title: 'Snapshot every file.', desc: 'Content-addressed snapshots of every file read or written during a trace. Full context, always.' },
				{ color: 'text-accent', label: 'Real-time', title: 'SSE event stream.', desc: 'Live updates as traces flow in. No polling, no refresh. Debug production issues as they happen.' },
				{ color: 'text-text-muted', label: 'Local-first', title: 'Your data stays yours.', desc: 'SQLite on disk. No cloud needed. Zero dependencies. Upgrade to hosted when ready.' },
			] as card, i}
				<InView delay={i * 50}>
					<div class="bg-bg-secondary/40 border border-border/30 rounded-2xl p-6 h-full hover:border-border/50 transition-all duration-300 hover:translate-y-[-2px]">
						<div class="{card.color} font-mono text-[10px] mb-3 uppercase tracking-wider opacity-70">{card.label}</div>
						<h3 class="text-[16px] font-semibold text-text mb-2 leading-snug">{card.title}</h3>
						<p class="text-[13px] text-text-secondary leading-relaxed">{card.desc}</p>
					</div>
				</InView>
			{/each}
		</div>
	</div>
</section>

<!-- ═══════════════════════════════════════════════════ -->
<!-- SINGLE BINARY SECTION — stats                       -->
<!-- ═══════════════════════════════════════════════════ -->
<section class="py-16 md:py-24 relative">
	<div class="absolute inset-0 bg-gradient-to-b from-bg via-bg-secondary/20 to-bg pointer-events-none"></div>
	<div class="relative max-w-[900px] mx-auto px-6 text-center">
		<InView>
			<h2 class="text-[clamp(1.8rem,4vw,2.8rem)] font-bold tracking-tight text-text leading-tight">
				Single binary. Zero dependencies.
			</h2>
			<p class="text-text-secondary mt-4 max-w-lg mx-auto">
				Built in Rust. Sub-millisecond proxy overhead. No containers, no Docker, no cloud account required.
			</p>
		</InView>
		<InView delay={100}>
			<div class="grid grid-cols-2 md:grid-cols-4 gap-8 mt-14">
				{#each [
					{ value: '<1ms', label: 'Proxy overhead' },
					{ value: '0', label: 'Dependencies' },
					{ value: '~6MB', label: 'Binary size' },
					{ value: '∞', label: 'Local traces' },
				] as stat}
					<div>
						<div class="text-3xl md:text-4xl font-bold text-text tracking-tight">{stat.value}</div>
						<div class="text-[11px] text-text-muted mt-1.5 uppercase tracking-wider">{stat.label}</div>
					</div>
				{/each}
			</div>
		</InView>
	</div>
</section>

<!-- ═══════════════════════════════════════════════════ -->
<!-- SETUP — three steps                                 -->
<!-- ═══════════════════════════════════════════════════ -->
<section id="setup" class="py-20 md:py-32">
	<div class="max-w-[900px] mx-auto px-6">
		<InView>
			<div class="text-center mb-14">
				<h2 class="text-[clamp(1.8rem,4vw,2.8rem)] font-bold tracking-tight text-text">
					Three commands. Full observability.
				</h2>
				<p class="text-text-secondary mt-4 max-w-md mx-auto">
					Install, run, trace. No config files, no setup wizards.
				</p>
			</div>
		</InView>

		<div class="max-w-xl mx-auto space-y-3">
			{#each [
				{ n: '01', label: 'Install', cmd: 'cargo install traceway', out: 'Installed to ~/.cargo/bin/traceway' },
				{ n: '02', label: 'Run', cmd: 'traceway --target-url https://api.openai.com', out: 'Proxy on :3001 → api.openai.com' },
				{ n: '03', label: 'Trace', cmd: 'python app.py  # point base_url at :3001', out: '3 traces captured · $0.012 · localhost:3000' },
			] as step, i}
				<InView delay={i * 80}>
					<div class="flex gap-4 items-start">
						<div class="shrink-0 w-12 pt-3.5 text-center">
							<div class="text-accent/60 font-mono text-[10px] font-semibold">{step.n}</div>
							<div class="text-[11px] text-text-muted/50 mt-0.5">{step.label}</div>
						</div>
						<div class="flex-1 rounded-xl border border-border/30 bg-[#0d0d14] overflow-hidden">
							<div class="px-4 py-3 font-mono text-[12px]">
								<div class="text-text/65"><span class="text-accent/40">$ </span>{step.cmd}</div>
								<div class="text-accent/40 mt-0.5">{step.out}</div>
							</div>
						</div>
					</div>
				</InView>
			{/each}
		</div>
	</div>
</section>

<!-- ═══════════════════════════════════════════════════ -->
<!-- PRICING                                             -->
<!-- ═══════════════════════════════════════════════════ -->
<section id="pricing" class="py-20 md:py-32 relative">
	<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-accent/[0.015] blur-[200px] rounded-full pointer-events-none"></div>

	<div class="relative max-w-[1000px] mx-auto px-6">
		<InView>
			<div class="text-center mb-14">
				<h2 class="text-[clamp(1.8rem,4vw,2.8rem)] font-bold tracking-tight text-text">
					Start free. Scale when ready.
				</h2>
				<p class="text-text-secondary mt-4 max-w-md mx-auto">
					Self-host for free forever, or let us handle the infrastructure.
				</p>
			</div>
		</InView>

		<div class="grid md:grid-cols-3 gap-4 max-w-3xl mx-auto">
			{#each [
				{ name: 'Free', price: '$0', period: '/mo', pop: false, desc: 'Local dev and getting started.', features: ['10K spans/month', '7-day retention', '1 team member', 'Community support'], cta: 'Get started' },
				{ name: 'Pro', price: '$20', period: '/user/mo', pop: true, desc: 'Teams shipping AI to production.', features: ['1M spans/month', '30-day retention', '5 team members', 'Email support'], cta: 'Start free trial' },
				{ name: 'Team', price: '$100', period: '/user/mo', pop: false, desc: 'Full observability at scale.', features: ['10M spans/month', '90-day retention', '50 team members', 'Priority support'], cta: 'Get started' },
			] as plan, i}
				<InView delay={i * 60}>
					<div class="relative {plan.pop ? 'bg-bg-secondary border-2 border-accent/30 shadow-[0_0_60px_rgba(110,231,183,0.04)]' : 'bg-bg-secondary/40 border border-border/30'} rounded-2xl p-6 flex flex-col h-full transition-all duration-300 hover:translate-y-[-2px]">
						{#if plan.pop}
							<div class="absolute -top-2.5 left-1/2 -translate-x-1/2">
								<span class="bg-accent text-bg text-[9px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full">Popular</span>
							</div>
						{/if}
						<div class="mb-5">
							<div class="text-[10px] {plan.pop ? 'text-accent' : 'text-text-muted/50'} uppercase tracking-wider mb-2 font-mono">{plan.name}</div>
							<div class="flex items-baseline gap-1">
								<span class="text-3xl font-bold text-text">{plan.price}</span>
								<span class="text-sm text-text-muted/50">{plan.period}</span>
							</div>
							<p class="text-[12px] text-text-secondary mt-1.5">{plan.desc}</p>
						</div>
						<ul class="space-y-2 text-[12px] flex-1 mb-6">
							{#each plan.features as f}
								<li class="flex items-center gap-2 text-text-secondary">
									<svg class="w-3 h-3 shrink-0 {plan.pop ? 'text-accent' : 'text-text-muted/40'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
									{f}
								</li>
							{/each}
						</ul>
						<a
							href="https://platform.traceway.ai/signup"
							class="block text-center text-[13px] rounded-xl px-4 py-2.5 transition-all {plan.pop ? 'font-semibold bg-accent text-bg hover:brightness-110 shadow-sm' : 'text-text-secondary border border-border/40 hover:bg-bg-tertiary hover:text-text'}"
						>
							{plan.cta}
						</a>
					</div>
				</InView>
			{/each}
		</div>

		<!-- Enterprise + Self-hosted -->
		<div class="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto mt-4">
			{#each [
				{ name: 'Enterprise', desc: 'Unlimited everything. SSO, SAML, dedicated support.', cta: 'Contact', href: 'mailto:support@traceway.ai' },
				{ name: 'Self-hosted', desc: 'Free forever. Unlimited traces. No account needed.', cta: 'GitHub', href: 'https://github.com/blastgits/traceway' },
			] as row}
				<InView delay={80}>
					<div class="bg-bg-secondary/40 border border-border/30 rounded-2xl px-6 py-4 flex items-center justify-between gap-4">
						<div>
							<div class="text-[13px] font-medium text-text">{row.name}</div>
							<p class="text-[12px] text-text-secondary mt-0.5">{row.desc}</p>
						</div>
						<a href={row.href} class="shrink-0 text-[12px] text-text-secondary border border-border/40 rounded-xl px-4 py-1.5 hover:bg-bg-tertiary hover:text-text transition-all">{row.cta}</a>
					</div>
				</InView>
			{/each}
		</div>

		<p class="text-center text-[11px] text-text-muted/40 mt-6">
			Billed monthly via <a href="https://polar.sh" target="_blank" rel="noopener" class="text-accent/50 hover:text-accent transition-colors">Polar</a>. Cancel anytime.
		</p>
	</div>
</section>

<!-- ═══════════════════════════════════════════════════ -->
<!-- CTA — clean centered card, Restate style            -->
<!-- ═══════════════════════════════════════════════════ -->
<section class="py-20 md:py-32">
	<div class="max-w-[800px] mx-auto px-6">
		<InView>
			<div class="rounded-3xl border border-border/40 bg-bg-secondary/50 px-8 py-16 md:py-20 text-center">
				<h2 class="text-[clamp(2rem,5vw,3.2rem)] font-bold tracking-tight text-text leading-tight">
					Stop flying blind.
				</h2>
				<p class="mt-4 text-text-secondary max-w-md mx-auto leading-relaxed">
					One binary. No config. See your first traces in under a minute.
				</p>
				<div class="flex flex-wrap items-center justify-center gap-3 mt-8">
					<a
						href="https://platform.traceway.ai/signup"
						class="inline-flex items-center gap-2 bg-accent text-bg font-semibold text-sm px-6 py-2.5 rounded-xl hover:brightness-110 hover:shadow-[0_0_40px_rgba(110,231,183,0.2)] transition-all shadow-sm"
					>
						Get Started
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
					</a>
					<a
						href="https://github.com/blastgits/traceway"
						target="_blank"
						rel="noopener"
						class="inline-flex items-center gap-2 text-sm text-text bg-bg-secondary border border-border/50 rounded-xl px-6 py-2.5 hover:bg-bg-tertiary transition-all"
					>
						Read Docs
					</a>
				</div>
			</div>
		</InView>
	</div>
</section>

<!-- FOOTER -->
<footer class="border-t border-border/20 py-10">
	<div class="max-w-[1000px] mx-auto px-6">
		<div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
			<div>
				<span class="font-mono text-[13px] text-text-muted/50 tracking-tight">traceway</span>
				<p class="text-[11px] text-text-muted/25 mt-1">MIT Licensed. Open source LLM observability.</p>
			</div>
			<div class="flex items-center gap-5">
				<a href="https://github.com/blastgits/traceway" target="_blank" rel="noopener" class="text-[12px] text-text-muted/40 hover:text-text-secondary transition-colors">GitHub</a>
				<a href="https://platform.traceway.ai/login" class="text-[12px] text-text-muted/40 hover:text-text-secondary transition-colors">Cloud Login</a>
				<a href="https://platform.traceway.ai/signup" class="text-[12px] text-text-muted/40 hover:text-text-secondary transition-colors">Sign up</a>
			</div>
		</div>
	</div>
</footer>
