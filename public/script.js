// Theme handling
const toggle = document.getElementById('themeToggle');
const html = document.documentElement;

// Load saved theme or system preference
const saved = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

if (saved === 'dark' || (!saved && prefersDark)) {
	html.setAttribute('data-theme', 'dark');
	toggle.textContent = '☀️';
}

toggle.addEventListener('click', () => {
	const isDark = html.getAttribute('data-theme') === 'dark';
	if (isDark) {
		html.removeAttribute('data-theme');
		toggle.textContent = '🌙';
		localStorage.setItem('theme', 'light');
	} else {
		html.setAttribute('data-theme', 'dark');
		toggle.textContent = '☀️';
		localStorage.setItem('theme', 'dark');
	}
});

// Form handling + cleaning logic
document.getElementById('urlForm').addEventListener('submit', async (e) => {
	e.preventDefault();
	const url = document.getElementById('urlInput').value.trim();
	if (!url) return;

	const resultsCard = document.getElementById('results') || createResultsCard();
	resultsCard.innerHTML = '<p class="loading">Fetching and cleaning…</p>';

	try {
		const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`); if (!res.ok) {
			const errorText = await res.text();
			throw new Error(`Proxy error ${res.status}: ${errorText}`);
		}

		const rawHtml = await res.text();
		const cleaned = cleanStatuteHtml(rawHtml);
		resultsCard.innerHTML = cleaned;
	} catch (err) {
		console.error(err);
		resultsCard.innerHTML = `<p class="error">${err.message}</p>`;
	}
});

function createResultsCard() {
	const card = document.createElement('div');
	card.className = 'card results';
	card.id = 'results';

	// Insert after the form card and before the instructions card
	const formCard = document.querySelector('.card');          // first .card is the form
	const instructionsCard = document.querySelector('.card.instructions');

	if (instructionsCard) {
		instructionsCard.parentNode.insertBefore(card, instructionsCard);
	} else if (formCard) {
		formCard.after(card);
	} else {
		document.querySelector('.container').appendChild(card);
	}

	return card;
}

/**
 * Main cleaning function
 * - Extracts the real statute content
 * - Makes every Section collapsible
 * - Improves indentation hierarchy
 */
function cleanStatuteHtml(rawHtml) {
	console.group('Statute Cleaner – parsing');
	//console.log('Raw HTML length:', rawHtml.length);

	// ---------- 1. Extract the statute fragment as a string ----------
	// The real content is almost always inside a <font face="Verdana"...> that
	// itself contains a full nested HTML document.
	let statuteHtml = null;

	// Method A: look for the nested document that contains class="Section"
	const fontMatch = rawHtml.match(
		/<font[^>]*face=["']Verdana["'][^>]*>([\s\S]*?)<\/font>/i
	);
	if (fontMatch) {
		statuteHtml = fontMatch[1];
		//console.log('Found content inside <font face="Verdana">');
	}

	// Method B: fallback – grab everything from the innermost <div class="Section">
	if (!statuteHtml || !statuteHtml.includes('class="Section"')) {
		const sectionStart = rawHtml.indexOf('<div class="Section">');
		if (sectionStart !== -1) {
			// Find a reasonable end (the closing </div></body></html> of the nested doc)
			const endMarkers = ['</body>', '</html>', '</font>'];
			let end = rawHtml.length;
			for (const marker of endMarkers) {
				const idx = rawHtml.indexOf(marker, sectionStart);
				if (idx !== -1 && idx < end) end = idx;
			}
			statuteHtml = rawHtml.slice(sectionStart, end);
			//console.log('Fell back to slicing from <div class="Section">');
		}
	}

	// Method C: last resort – whole document
	if (!statuteHtml) {
		statuteHtml = rawHtml;
		console.warn('Could not isolate nested statute – parsing whole page');
	}

	//console.log('Extracted fragment length:', statuteHtml.length);
	//console.log('Contains class="Section":', statuteHtml.includes('class="Section"'));
	//console.log('Contains class="Chapters":', statuteHtml.includes('class="Chapters"'));

	// ---------- 2. Parse the extracted fragment ----------
	const parser = new DOMParser();
	const doc = parser.parseFromString(statuteHtml, 'text/html');

	let statuteRoot = doc.querySelector('.Chapters') || doc.querySelector('.Section');

	// Extra safety: sometimes the parser still moves things
	if (!statuteRoot) {
		// Try looking in the whole original document as a last resort
		const fullDoc = parser.parseFromString(rawHtml, 'text/html');
		statuteRoot = fullDoc.querySelector('.Chapters') || fullDoc.querySelector('.Section');
		//console.log('Tried full document parse, found root?', !!statuteRoot);
	}

	if (!statuteRoot) {
		console.error('FAILED to locate .Section or .Chapters');
		console.groupEnd();
		return `<p class="error">Could not find statute content on this page.<br>
            Open the browser console (F12) for detailed logs.</p>`;
	}

	//console.log('Successfully found root:', statuteRoot.className);
	console.groupEnd();

	// ---------- 3. Clone and process ----------
	const cleaned = statuteRoot.cloneNode(true);

	// Collect all sections (works for both single-section and chapter pages)
	const sections = cleaned.matches?.('.Section')
		? [cleaned]
		: Array.from(cleaned.querySelectorAll('.Section'));

	//console.log('Number of .Section elements to process:', sections.length);

	// We will collect the new details elements
	const newSections = [];

	sections.forEach((section, idx) => {
		const numberEl = section.querySelector('.SectionNumber');
		const catchlineEl = section.querySelector('.CatchlineText') || section.querySelector('.Catchline');
		const bodyEl = section.querySelector('.SectionBody');
		const historyEl = section.querySelector('.History');

		const number = numberEl ? numberEl.textContent.trim() : '';
		const catchline = catchlineEl ? catchlineEl.textContent.trim() : '';

		const details = document.createElement('details');
		details.className = 'statute-section';
		details.open = true; // open by default

		const summary = document.createElement('summary');
		summary.innerHTML = `<span class="sec-num">${escapeHtml(number)}</span>
                         <span class="sec-catchline">${escapeHtml(catchline)}</span>`;
		details.appendChild(summary);

		const content = document.createElement('div');
		content.className = 'section-content';

		if (bodyEl) {
			content.appendChild(processSectionBody(bodyEl));
		}

		if (historyEl) {
			const hist = historyEl.cloneNode(true);
			hist.classList.add('history-block');
			content.appendChild(hist);
		}

		details.appendChild(content);
		newSections.push(details);
	});

	// ---------- 4. Build final output ----------
	// If we only had one section and it was the root, just use that
	// Otherwise wrap all sections
	let contentNode;
	if (newSections.length === 1 && cleaned.matches?.('.Section')) {
		contentNode = newSections[0];
	} else {
		// Keep any non-section content (e.g. chapter title, catchline index)
		// and replace the old sections with the new details
		const wrapper = document.createElement('div');
		wrapper.className = 'chapter-wrapper';

		// Copy non-section children first (title, index, etc.)
		Array.from(cleaned.childNodes).forEach(node => {
			if (node.nodeType === 1 && node.classList?.contains('Section')) return;
			wrapper.appendChild(node.cloneNode(true));
		});

		newSections.forEach(s => wrapper.appendChild(s));
		contentNode = wrapper;
	}

	return buildWrapper(contentNode);
}

/**
 * Convert the messy SectionBody into clean, indented plain text
 * while preserving hyperlinks.
 * removes soft hyphens / zero-width chars that cause broken word
 */
function processSectionBody(bodyEl) {
	// 1. Start from innerHTML so we keep <a> tags
	let html = bodyEl.innerHTML;

	// 2. Very aggressive cleanup of characters that cause broken words
	html = html
		// soft hyphen – Unicode form
		.replace(/\u00AD/g, '')
		// soft hyphen – HTML entity forms (the real culprit)
		.replace(/&shy;/gi, '')
		.replace(/&#173;/gi, '')
		.replace(/&#x0*AD;/gi, '')
		// zero-width spaces and joiners
		.replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
		// various special spaces → normal space
		.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
		// the em-space Florida uses after numbers
		.replace(/&#x2003;|&emsp;/gi, ' ')
		.replace(/\u2003/g, ' ')
		// normalize dashes
		.replace(/&#x2014;|&mdash;/gi, '—')
		// collapse whitespace
		.replace(/\s+/g, ' ');

	// 3. Protect links
	const links = [];
	html = html.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
		(match, href, text) => {
			const id = links.length;
			// also clean the link text
			const cleanText = text
				.replace(/<[^>]+>/g, '')
				.replace(/\u00AD/g, '')
				.replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
				.replace(/\s+/g, ' ')
				.trim();
			links.push({ href, text: cleanText });
			return `%%LINK${id}%%`;
		});

	// 4. Strip remaining tags
	let text = html
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	// 4b. Protect Florida statute citations so they are never split
	//     Matches: "s. 893.135(1)", "ss. 775.082", "s. %%LINK0%% (1)", etc.
	//     Does NOT match hierarchical list items like "s. Human trafficking"
	const citations = [];
	text = text.replace(
		/\b(?:s|ss)\.?\s*(?:%%LINK\d+%%|\d[\d.]*)(?:\s*\([0-9a-z]+\))*/gi,
		(match) => {
			const id = citations.length;
			citations.push(match);
			return `%%CITE${id}%%`;
		}
	);



	// 5. Split on Florida hierarchical numbering
	const sub1re = /\([0-9]+\)/g;
	const sub2re = /\([a-z]+\)/g;
	const sub3re = /[0-9]+\./g;
	const sub4re = /[a-z]\./g;

	function nextLetter(prev, curr) {
		if (!prev) return curr === "a";
		return prev.toLowerCase().charCodeAt(0) + 1 === curr.toLowerCase().charCodeAt(0);
	}

	function safeIndex(match) {
		return match ? match.index : Infinity;
	}

	/**
	 * Main parser
	 * Returns { nested, indented }
	 *   nested   → array of arrays preserving hierarchy
	 *   indented → text buffer with newline + correct number of tabs
	 */
	function parseSubsections(text) {
		// Reset lastIndex on all regexes
		[sub1re, sub2re, sub3re, sub4re].forEach(r => (r.lastIndex = 0));

		const nested = [];          // final nested structure
		const stack = [];           // helps build nesting: [{level, node}, ...]
		let lastIndex = 0;

		let sub1 = 0;
		let sub2 = "";
		let sub3 = 0;
		let sub4 = "";

		// Helper to push content into the deepest open node
		function addContent(content) {
			if (!content) return;
			if (stack.length === 0) {
				// top-level text before any subsection
				nested.push(["", content]);
			} else {
				const deepest = stack[stack.length - 1].node;
				deepest[1] += content;
			}
		}

		while (true) {
			// Find the next candidate of each type starting from lastIndex
			sub1re.lastIndex = lastIndex;
			sub2re.lastIndex = lastIndex;
			sub3re.lastIndex = lastIndex;
			sub4re.lastIndex = lastIndex;

			const m1 = sub1re.exec(text);
			const m2 = sub2re.exec(text);
			const m3 = sub3re.exec(text);
			const m4 = sub4re.exec(text);

			// Determine which (if any) is the closest valid sequential match
			let chosen = null;
			let chosenLevel = 0;
			let chosenMatch = null;

			// Priority: closest index that is also sequential
			const candidates = [
				{
					level: 1,
					match: m1,
					valid: m1 && Number(m1[0].slice(1, -1)) > sub1,
				},
				{
					level: 2,
					match: m2,
					valid:
						m2 &&
						((sub2 === "" && m2[0].slice(1, -1) === "a") ||
							nextLetter(sub2, m2[0].slice(1, -1))),
				},
				{
					level: 3,
					match: m3,
					valid: m3 && Number(m3[0].slice(0, -1)) > sub3,
				},
				{
					level: 4,
					match: m4,
					valid:
						m4 &&
						((sub4 === "" && m4[0].slice(0, -1) === "a") ||
							nextLetter(sub4, m4[0].slice(0, -1))),
				},
			];

			// Pick the valid candidate with the smallest index
			let bestIdx = Infinity;
			for (const c of candidates) {
				if (c.valid && c.match.index < bestIdx) {
					bestIdx = c.match.index;
					chosen = c;
				}
			}

			if (!chosen) break; // no more valid matches

			// Add text that was between previous match and this one
			addContent(text.slice(lastIndex, chosen.match.index));

			// Create the new node: [header, content]
			const node = [chosen.match[0], ""];

			// Adjust nesting stack according to level
			while (stack.length && stack[stack.length - 1].level >= chosen.level) {
				stack.pop();
			}

			if (stack.length === 0) {
				nested.push(node);
			} else {
				// Attach as child of the current deepest node
				const parent = stack[stack.length - 1].node;
				if (!Array.isArray(parent[1])) {
					// convert content string → array of children if needed
					parent[1] = parent[1] ? [["", parent[1]]] : [];
				}
				parent[1].push(node);
			}

			stack.push({ level: chosen.level, node });

			// Update sequence counters and reset deeper ones
			if (chosen.level === 1) {
				sub1 = Number(chosen.match[0].slice(1, -1));
				sub2 = "";
				sub3 = 0;
				sub4 = "";
			} else if (chosen.level === 2) {
				sub2 = chosen.match[0].slice(1, -1);
				sub3 = 0;
				sub4 = "";
			} else if (chosen.level === 3) {
				sub3 = Number(chosen.match[0].slice(0, -1));
				sub4 = "";
			} else if (chosen.level === 4) {
				sub4 = chosen.match[0].slice(0, -1);
			}

			lastIndex = chosen.match.index + chosen.match[0].length;
		}

		// Remaining text after the last match
		addContent(text.slice(lastIndex));

		// ---------- Build indented text buffer ----------
		function toIndented(nodes, depth = 0) {
			let out = "";
			for (const [header, content] of nodes) {
				if (header) {
					out += "\t".repeat(depth) + header + "\n";
				}
				if (typeof content === "string") {
					if (content.trim()) {
						const lines = content.split("\n");
						for (const line of lines) {
							if (line.trim()) {
								out += "\t".repeat(depth + (header ? 1 : 0)) + line + "\n";
							} else {
								out += "\n";
							}
						}
					}
				} else if (Array.isArray(content)) {
					out += toIndented(content, depth + (header ? 1 : 0));
				}
			}
			return out;
		}

		const indented = toIndented(nested);

		return { nested, indented };
	}
	parsed = parseSubsections(text);


	// 6. Build DOM
	const container = document.createElement('div');
	container.className = 'section-body';

	lines.forEach(line => {
		if (!line.number && !line.text) return;

		const row = document.createElement('div');
		row.className = `statute-line level-${line.level}`;

		if (line.number) {
			const numSpan = document.createElement('span');
			numSpan.className = 'Number';
			numSpan.textContent = line.number;
			row.appendChild(numSpan);
		}

		const textSpan = document.createElement('span');
		textSpan.className = 'Text';
		textSpan.innerHTML = line.text || '';
		row.appendChild(textSpan);

		container.appendChild(row);
	});

	return container;
}

function restoreLinks(str, links) {
	return str.replace(/%%LINK(\d+)%%/g, (_, id) => {
		const link = links[Number(id)];
		if (!link) return '';
		return `<a href="${link.href}" target="_blank" rel="noopener">${link.text}</a>`;
	});
}

function restoreCitations(str, citations) {
	return str.replace(/%%CITE(\d+)%%/g, (_, id) => {
		return citations[Number(id)] || '';
	});
}

function restoreAll(str, links, citations) {
	// Restore citations first (they may contain %%LINK%% placeholders),
	// then restore the links inside them.
	return restoreLinks(restoreCitations(str, citations), links);
}

function getIndentLevel(number) {
	if (!number) return 0;

	// (1) (2) (3) …
	if (/^\(\d+\)$/.test(number)) return 0;

	// (a) (b) (c) …
	if (/^\([a-z]\)$/i.test(number)) return 1;

	// (2)(a)1.  or  (b)1.  → treat as level 2
	if (/\d+\.$/.test(number) && /\(/.test(number)) return 2;

	// 1. 2. 3. …
	if (/^\d+\.$/.test(number)) return 2;

	// a. b. c. …
	if (/^[a-z]\.$/i.test(number)) return 3;

	return 0;
}

/**
 * Build the final wrapper with controls
 */
function buildWrapper(contentNode) {
	const wrapper = document.createElement('div');
	wrapper.className = 'cleaned-statute';

	const header = document.createElement('div');
	header.className = 'statute-header';
	header.innerHTML = `
    <div class="controls">
      <button type="button" id="expandAll">Expand all</button>
      <button type="button" id="collapseAll">Collapse all</button>
      <button type="button" id="copyStatute">Copy</button>
    </div>
  `;
	wrapper.appendChild(header);
	wrapper.appendChild(contentNode);

	// Wire buttons after the HTML is inserted into the page
	setTimeout(() => {
		const root = document.getElementById('results');
		if (!root) return;

		root.querySelector('#expandAll')?.addEventListener('click', () => {
			root.querySelectorAll('details').forEach(d => (d.open = true));
		});

		root.querySelector('#collapseAll')?.addEventListener('click', () => {
			root.querySelectorAll('details').forEach(d => (d.open = false));
		});

		root.querySelector('#copyStatute')?.addEventListener('click', () => {
			copyStatuteAsText(root);
		});
	}, 0);

	return wrapper.outerHTML;
}

/**
 * Copy the cleaned statute as plain text with proper indentation
 * so it pastes cleanly into email, Word, notes, etc.
 */
function copyStatuteAsText(root) {
	const lines = [];

	// Header
	const summary = root.querySelector('details.statute-section > summary');
	if (summary) {
		const num = summary.querySelector('.sec-num')?.textContent?.trim() || '';
		const catchline = summary.querySelector('.sec-catchline')?.textContent?.trim() || '';
		lines.push(`${num} ${catchline}`.trim());
		lines.push('');
	}

	// Body
	root.querySelectorAll('.statute-line').forEach(row => {
		const levelClass = [...row.classList].find(c => c.startsWith('level-'));
		const level = levelClass ? Number(levelClass.replace('level-', '')) : 0;
		const indent = '    '.repeat(level);

		const number = row.querySelector('.Number')?.textContent?.trim() || '';
		const text = row.querySelector('.Text')?.textContent?.trim() || '';

		if (number || text) {
			lines.push(`${indent}${number} ${text}`.trimEnd());
		}
	});

	// History
	const history = root.querySelector('.history-block, .History');
	if (history) {
		lines.push('');
		lines.push(history.textContent.replace(/\s+/g, ' ').trim());
	}

	const plainText = lines.join('\n');

	navigator.clipboard.writeText(plainText).then(() => {
		const btn = root.querySelector('#copyStatute');
		if (btn) {
			const original = btn.textContent;
			btn.textContent = 'Copied!';
			btn.disabled = true;
			setTimeout(() => {
				btn.textContent = original;
				btn.disabled = false;
			}, 1500);
		}
	}).catch(err => {
		console.error('Copy failed:', err);
		alert('Could not copy to clipboard.');
	});
}

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
