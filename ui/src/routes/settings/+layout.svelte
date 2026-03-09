<script lang="ts">
	import { page } from '$app/state';
	let { children } = $props();

	const tabs = [
		{ href: '/settings/providers', label: 'Providers' },
		{ href: '/settings', label: 'Settings' },
		{ href: '/settings/team', label: 'Team' },
		{ href: '/settings/api-keys', label: 'API Keys' },
		{ href: '/settings/usage', label: 'Usage' },
		{ href: '/settings/billing', label: 'Billing' }
	];

	function isActive(href: string): boolean {
		if (href === '/settings') return page.url.pathname === '/settings';
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}
</script>

<div class="app-shell-wide space-y-4">
	<nav class="app-toolbar-shell rounded-xl p-2" aria-label="Settings sections">
		<div class="flex items-center gap-2 overflow-x-auto pb-0.5">
			{#each tabs as tab}
				<a
					href={tab.href}
					class="shrink-0 rounded-lg px-3 py-2 text-sm border transition-colors {isActive(tab.href)
						? 'bg-bg-tertiary/85 border-border/80 text-text'
						: 'border-transparent text-text-secondary hover:text-text hover:bg-bg-tertiary/40'}"
				>
					{tab.label}
				</a>
			{/each}
		</div>
	</nav>

	<div>
		{@render children()}
	</div>
</div>
