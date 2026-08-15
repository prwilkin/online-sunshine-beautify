export async function onRequestGet(context) {
	const { request } = context;
	const url = new URL(request.url);
	const target = url.searchParams.get("url");

	if (!target) {
		return new Response("Missing url parameter", { status: 400 });
	}

	let targetUrl;
	try {
		targetUrl = new URL(target);
		if (!["http:", "https:"].includes(targetUrl.protocol)) {
			return new Response("Invalid protocol", { status: 400 });
		}
	} catch {
		return new Response("Invalid URL", { status: 400 });
	}

	// Recommended: lock it down to Florida statutes for safety
	const allowedHosts = ["www.leg.state.fl.us", "leg.state.fl.us"];
	if (!allowedHosts.includes(targetUrl.hostname)) {
		return new Response(
			`Domain not allowed. Received hostname: "${targetUrl.hostname}"`,
			{ status: 403 }
		);
	}

	try {
		const upstream = await fetch(targetUrl.toString(), {
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; FLStatuteCleaner/1.0)",
				"Accept": "text/html,application/xhtml+xml",
			},
			redirect: "follow",
		});

		if (!upstream.ok) {
			return new Response(`Upstream error: ${upstream.status}`, {
				status: upstream.status,
			});
		}

		const html = await upstream.text();

		return new Response(html, {
			status: 200,
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "public, max-age=300",
				// No need for Access-Control-Allow-Origin when frontend + function are on same domain
			},
		});
	} catch (err) {
		return new Response("Fetch failed: " + err.message, { status: 502 });
	}
}