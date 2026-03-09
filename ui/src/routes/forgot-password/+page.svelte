<script lang="ts">
	import { forgotPassword } from '$lib/api';
	import TracewayWordmark from '$lib/components/TracewayWordmark.svelte';

	let email = $state('');
	let error = $state('');
	let loading = $state(false);
	let submitted = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		loading = true;

		const result = await forgotPassword(email);

		if (result.ok) {
			submitted = true;
		} else {
			error = result.message ?? 'Something went wrong';
		}

		loading = false;
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-bg">
	<div class="w-full max-w-sm space-y-6">
		<div class="text-center">
			<a href="/" class="inline-flex items-center justify-center px-3 h-10 rounded-lg border border-border/65 bg-bg-secondary/65 hover:border-border transition-colors">
				<TracewayWordmark className="h-4.5 w-auto text-text" />
			</a>
			<p class="text-text-muted text-sm mt-1">Reset your password</p>
		</div>

		{#if submitted}
			<div class="bg-bg-secondary border border-border rounded p-6 space-y-3">
				<div class="bg-success/10 border border-success/30 rounded px-3 py-2 text-success text-sm">
					Check your email for a reset link.
				</div>
				<p class="text-text-muted text-sm">
					If an account exists for <strong class="text-text">{email}</strong>, we've sent a password reset link. The link expires in 1 hour.
				</p>
			</div>
		{:else}
			<form onsubmit={handleSubmit} class="bg-bg-secondary border border-border rounded p-6 space-y-4">
				{#if error}
					<div class="bg-danger/10 border border-danger/30 rounded px-3 py-2 text-danger text-sm">
						{error}
					</div>
				{/if}

				<p class="text-text-muted text-sm">
					Enter your email address and we'll send you a link to reset your password.
				</p>

				<div>
					<label for="email" class="block text-xs text-text-secondary mb-1">Email</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						required
						autocomplete="email"
						class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
						placeholder="you@example.com"
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					class="w-full bg-accent text-bg font-semibold py-2 rounded text-sm hover:bg-accent/80 transition-colors disabled:opacity-50"
				>
					{loading ? 'Sending...' : 'Send reset link'}
				</button>
			</form>
		{/if}

		<p class="text-center text-sm text-text-muted">
			Remember your password?
			<a href="/login" class="text-accent hover:underline">Sign in</a>
		</p>
	</div>
</div>
