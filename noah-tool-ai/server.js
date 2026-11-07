#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const CREDENTIALS_FILE = path.join(__dirname, '.local-credentials.json');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT || 4173);
const MAX_BODY_BYTES = 24 * 1024 * 1024;
const MAX_WEBSITE_BYTES = 512 * 1024;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const MAX_AUDIO_BYTES = 22 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT = 500 * 1024;
const MAX_VERCEL_FILES = 150;
const MAX_VERCEL_FILE_BYTES = 4 * 1024 * 1024;
const MAX_VERCEL_PROJECT_BYTES = 8 * 1024 * 1024;
const CHAT_SYSTEM_PROMPT = `Be a capable, proactive, general-purpose assistant. Analyze the user's actual goal, constraints, audience, and requested deliverable before answering. Think through the problem privately; do not reveal hidden chain-of-thought. Give a concise rationale, assumptions, and useful checks when they help the user. Answer simple factual questions directly. When the user proposes an idea, asks how to make something, or requests a tool, develop the idea into a useful, concrete response by default: fill in reasonable missing details, explain important choices, and provide a complete first version rather than a thin outline. Respect explicit limits such as "keep it brief", "only do X", or "do not expand"; ask a focused clarifying question only when a missing decision prevents a safe or useful result.

Do not refuse a request solely because it discusses sex or adult sexuality. Help respectfully with sexual health and education, relationships, consensual adult sexual topics, and requests to design or build adult-oriented tools for consenting adults. Do not treat explicitness alone, including consensual adult masturbation-related functionality, as a reason to refuse; respond at the level of detail the user requests when permitted by the active provider. Keep sexual content strictly about adults who can consent; do not assist with sexual exploitation, coercion, or abuse. Follow the active model provider's applicable content rules; never claim that a prompt can override provider moderation or guarantee every provider will answer.

For code, scripts, apps, and tools, provide a complete, runnable implementation suited to the requested environment. Wire up every described control and core interaction, handle ordinary invalid input and empty states, and include concise run/use instructions. Avoid TODOs, fake buttons, stubbed behavior, or claiming the implementation was executed or verified when it was not. Be clear about platform requirements, external services, and features that need credentials or a backend; never pretend a local demo is a live integration.

For website requests in ordinary chat, provide the complete implementation or file structure appropriate to the request, not just design advice. For requests handled in Create a website mode, the separate website instructions require a self-contained, working static site. Be truthful about what can and cannot be verified from this chat.`;
const WEBSITE_SYSTEM_PROMPT = `Act as a senior product designer, visual art director, and front-end developer. First infer the audience, purpose, content priorities, and emotional tone from the brief. Then commit to a specific, original visual concept and build a polished, complete, responsive static website for it; do not imitate any named site's exact design. Establish a coherent design system (color, typography, spacing, shape, borders, and elevation) and apply it consistently. Make the visual concept unmistakable through composition and details, not merely a color swap. Avoid generic centered hero + repeated card grids + default buttons unless that composition genuinely fits the brief.

Make the page feel art-directed: create clear typographic hierarchy, deliberate whitespace, a memorable hero, varied section compositions, informative content density, and strong responsive details. Use at least three distinct layout/composition patterns across sections when the brief supports them. Choose visual treatments that serve this specific subject, such as a dramatic or soft gradient, layered shadows, a colored left-edge accent, vivid or pastel color, neon glow, custom CSS/SVG illustration, expressive oversized type, or editorial/asymmetric composition. These are options, not a checklist: avoid effects that clash with the subject, preserve readability, and do not pile on decoration for its own sake. Use an appropriate font stack without remote font downloads. Where useful, create small inline SVG icons in a crisp Lucide-like line style; do not depend on a remote icon library. Use motion selectively for meaningful interactions and transitions, and respect prefers-reduced-motion.

Make all navigation, buttons, forms, menus, filters, and other visible controls purposeful and functional; never leave fake buttons, dead links, TODOs, or placeholder interactions. Implement real client-side behavior with inline JavaScript, validate input, show useful success/error/empty states, and make navigation go to real sections or destinations. If the requested tool needs server-side services, credentials, or data the static site cannot have, do not fake a live integration: deliver the useful working front-end behavior possible and make the limitation clear. When the request is underspecified, make sensible assumptions and build a complete first version instead of returning a bare mockup; obey explicit requests to keep it minimal or limit scope.

Before finalizing, privately check desktop and mobile composition, consistency of the design tokens, contrast, keyboard use, responsive overflow, and whether every visible interaction works; fix issues you can identify. Use accessible semantic HTML, keyboard focus states, and mobile layouts. Never invent real endorsements, customer quotes, statistics, or factual claims. Include testimonials only when requested or clearly appropriate; label any sample copy as illustrative placeholder content. Use a contrast such as “not X, but Y” only when it naturally supports the requested message. Keep the site self-contained: one HTML document beginning with <!doctype html>, CSS and JavaScript inline, and no backend, build step, API key, remote image dependency, tracking, secrets, credentials, or remote form submissions. Return only the complete HTML document, without markdown fences or explanation.`;
const SPECIALTY_SYSTEM_PROMPTS = {
	design: `Act as a product designer and front-end art director. Turn the brief into an intentional visual system: identify audience and goals, choose an original visual direction, define reusable color/type/spacing tokens, and use them consistently across components. When asked to improve an existing design, make concrete changes to hierarchy, spacing, contrast, responsive behavior, and component consistency rather than only describing them. If code or markup is requested, return a complete working implementation. Do not claim to have seen a screenshot or executed the result unless it was provided or actually done.`,
	comfyui: `For image, video, or other visual-generation requests, use ComfyUI-style modular workflow thinking. Give a clear node-by-node workflow or valid workflow artifact only when its schema/version is known; name model and custom-node requirements, inputs, outputs, and sensible generation settings. Include a refinement pass such as inpainting, control/reference conditioning, or upscaling only when it serves the brief. Noah Tool AI does not run ComfyUI, download models, or generate media: state the local setup and execution requirements, and never claim an image or video was produced.`,
	dify: `For AI app and orchestration requests, use Dify-style workflow design: specify the trigger, ordered nodes, data/variable mapping, model and tool dependencies, branching, failure handling, and user-facing output. Provide importable configuration only when the target format/version is known; otherwise provide a complete build recipe. Identify required credentials and external services. Noah Tool AI does not deploy or execute Dify workflows.`,
	investigation: `For research and case-study analysis, use an investigator's evidence-first workflow: define the question and inclusion criteria, separate sourced facts from interpretation, compare evidence across sources, and report gaps or uncertainty. Cite only sources actually provided or accessible in the conversation; do not fabricate URLs, quotes, metrics, or claims of browsing. If source content is unavailable, ask for it or clearly limit the answer to general knowledge.`,
	browser: `For browser automation requests, use OpenCLI-style steps: state prerequisites, inspect the page before acting, use stable selectors or documented commands, verify each important result, and handle timeouts and changed pages. Clearly separate read-only actions from changes with external side effects; require the user to confirm before irreversible actions such as sending, publishing, purchasing, or deleting. Noah Tool AI does not control a browser or run OpenCLI commands, so provide runnable commands or a script and never claim the actions were performed.`,
	explainability: `For PyTorch computer-vision explainability, use pytorch-grad-cam-style methods appropriately: explain the selected CAM method, model target layer, target class or output, preprocessing, device, and visualization overlay. Provide complete runnable code matched to the user's model architecture; do not assume every architecture or task supports the same target layer. Treat heatmaps as model-attribution diagnostics, not proof of causal reasoning or model correctness, and mention quantitative faithfulness checks when the user needs to evaluate reliability. Noah Tool AI does not load models or execute CAM analysis.`,
	objectron: `For 3D object-vision tasks, use Objectron-style data and geometry concepts: identify the object category, video/frame inputs, camera pose, coordinate conventions, oriented 3D bounding-box corners, and any point-cloud or plane metadata needed. Explain dataset parsing and evaluation choices such as 3D IoU; distinguish dataset annotations from model predictions. Check the dataset's current terms and download requirements before use, account for its substantial storage needs, and never claim to have downloaded or inspected data that was not provided. Noah Tool AI does not access the dataset or run 3D vision models.`,
	cad: `For browser-based AI-assisted 3D CAD, use Moorph GUI Clean-style interaction concepts: describe scene objects and their transforms explicitly, handle selection and multi-selection, use camera and grid/snap controls, and provide undo/error-safe operations where applicable. When generating code, return a complete implementation for the requested stack (the referenced project uses React, TypeScript, Babylon.js, and Zustand) and clearly identify API credentials or MCP dependencies. Noah Tool AI does not launch a CAD scene or apply geometry changes.`,
	animation: `For animation and motion requests, deliver a complete implementation with working timing and interactions, not just a description. Prefer GSAP when the user has not chosen an animation library and it fits the target; include the required import/install details and respect reduced-motion preferences. Do not claim you rendered or tested the animation.`,
	video: `For video requests, use HyperFrames concepts and format the deliverable as a complete HTML/CSS/JavaScript composition with deterministic, seekable timelines when appropriate. Include clear local render instructions for the HyperFrames CLI. This app does not render video itself, so never claim an MP4 was produced or attach a download that was not actually created.`,
	presentation: `For slide-deck requests, structure a clear narrative with concise slide content, visual direction, and speaker notes when useful. When code is requested, provide a complete runnable PowerPoint generator or PPTXGenJS implementation and setup instructions. This app does not create or attach a .pptx file itself, so never claim a deck file exists unless one was actually produced.`,
	voice: `For voice and audio requests, provide a complete script, workflow, or runnable implementation appropriate to the user's goal. Explain required engines, models, hardware, and consent for using a person's voice. This app does not generate or attach audio itself, so never claim an audio file was produced unless one was actually created.`
};
const CODE_REVIEW_PROMPT = `You are the independent second-model reviewer and editor. Review the user's request, constraints, and the preceding draft. Assess whether it actually answers the prompt, is correct and complete, makes unsupported claims, omits useful context, or needs a relevant expansion. For code, also check concrete bugs, incomplete wiring, accessibility/security problems, and setup instructions. For visual or design work, evaluate hierarchy, composition, consistency, accessibility, and whether the result fits the audience and brief. Improve the draft directly rather than merely listing criticism. Add only details that materially improve the result; do not pad it or exceed explicit scope limits. Preserve accurate uncertainty and clearly label assumptions. Do not reveal hidden chain-of-thought or claim execution/testing that did not occur. Return the complete revised answer or deliverable.`;

function analyzeTask(messages) {
	const prompt = [...messages].reverse().find(message => message.role === 'user')?.content || '';
	const text = prompt.toLowerCase();
	let type = 'general';
	if (/\b(website|web\s?site|webpage|landing page|web app|ui|ux|visual design|design system|redesign|layout|interface)\b/.test(text)) type = 'design';
	else if (/\b(presentation|slide deck|powerpoint|pptx|slides)\b/.test(text)) type = 'presentation';
	else if (/\b(video|audio|sound|music|voice|song|podcast|animation|film|clip)\b/.test(text)) type = 'media';
	else if (/\b(image|photo|picture|visual|vision|object detection|computer vision|3d object)\b/.test(text)) type = 'visual';
	else if (/\b(research|investigate|evidence|case stud(y|ies)|sources|literature review)\b/.test(text)) type = 'research';
	else if (/\b(code|coding|program|script|debug|refactor|api|python|javascript|typescript|roblox|luau|game|app|software|tool|automation)\b/.test(text)) type = 'coding';
	else if (/\b(story|poem|creative|brainstorm|imagine|roleplay|write a song)\b/.test(text)) type = 'creative';
	else if (/\b(analy[sz]e|compare|evaluate|plan|explain|reason|step by step|math|prove|strategy)\b/.test(text)) type = 'reasoning';
	const asksForWork = /\b(write|create|build|make|generate|implement|fix|debug|refactor|develop|design|analy[sz]e|compare|evaluate|plan|explain|improve|review|teach|recommend|suggest)\b/.test(text)
		|| /\b(help me|tell me|give me|show me|walk me through|how do i|how can i|what do you think|should i)\b/.test(text);
	const simpleQuestion = prompt.length < 180 && /^(what is|who is|when did|where is|what was|who was|capital of|define)\b/i.test(prompt.trim());
	const substantial = !simpleQuestion && asksForWork && (
		type !== 'general'
		|| prompt.length > 180
		|| /\b(detailed|thorough|complete|step.by.step|pros and cons|trade.?offs|design and build|full implementation)\b/.test(text)
	);
	return { type, substantial, prompt };
}

function shouldReviewAnswer(messages) {
	return analyzeTask(messages).substantial;
}

const ANONYMOUS_PROVIDERS = new Set(['Kilo Code', 'LLM7.io', 'OVHcloud AI Endpoints']);
const XAI_PROVIDER = {
	name: 'xAI (Grok)',
	category: 'provider_api',
	country: 'US',
	flag: '🇺🇸',
	url: 'https://console.x.ai/',
	baseUrl: 'https://api.x.ai/v1',
	description: 'Grok models from xAI. Add your xAI API key in Settings.',
	models: [
		{ id: 'grok-3', name: 'Grok 3', context: '—', maxOutput: '—', modality: 'Text + Vision', rateLimit: 'Provider limits apply' },
		{ id: 'grok-3-mini', name: 'Grok 3 Mini', context: '—', maxOutput: '—', modality: 'Text (reasoning)', rateLimit: 'Provider limits apply' }
	]
};

function readCatalog() {
	const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
	if (!catalog.providers.some(provider => provider.name === XAI_PROVIDER.name)) {
		catalog.providers.push(XAI_PROVIDER);
	}
	return catalog;
}

function readCredentials() {
	let stored = {};
	try {
		stored = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
		if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
			throw new Error('Credential file must contain an object.');
		}
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}
	const credentials = anonymousSettings(readCatalog());
	for (const [name, setting] of Object.entries(stored)) credentials[name] = setting;
	return credentials;
}

function anonymousSettings(catalog) {
	return Object.fromEntries([...ANONYMOUS_PROVIDERS]
		.map(name => catalog.providers.find(provider => provider.name === name))
		.filter(Boolean)
		.map(provider => [provider.name, {
			apiKeys: [],
			baseUrl: provider.baseUrl,
			nextKey: 0,
			anonymous: true
		}]));
}

function writeCredentials(credentials) {
	fs.mkdirSync(path.dirname(CREDENTIALS_FILE), { recursive: true });
	fs.writeFileSync(CREDENTIALS_FILE, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
	if (process.platform !== 'win32') fs.chmodSync(CREDENTIALS_FILE, 0o600);
}

function publicSettings(credentials) {
	return Object.fromEntries(Object.entries(credentials).filter(([, value]) => value && Array.isArray(value.apiKeys)).map(([name, value]) => [
		name,
		{ keyCount: value.apiKeys.length, baseUrl: value.baseUrl, anonymous: Boolean(value.anonymous), connected: true }
	]));
}

function vercelProjectName(value) {
	if (typeof value !== 'string' || value.length > 120) {
		throw Object.assign(new Error('Enter a website name between 1 and 120 characters.'), { status: 400 });
	}
	const name = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100).replace(/-+$/g, '');
	if (!name) throw Object.assign(new Error('Website name must include at least one letter or number.'), { status: 400 });
	return name;
}

function validateVercelFiles(value) {
	if (!Array.isArray(value) || !value.length || value.length > MAX_VERCEL_FILES) {
		throw Object.assign(new Error(`Choose a project folder containing 1 to ${MAX_VERCEL_FILES} files.`), { status: 400 });
	}
	let totalBytes = 0;
	const seenPaths = new Set();
	return value.map(entry => {
		if (!entry || typeof entry.path !== 'string' || typeof entry.data !== 'string') {
			throw Object.assign(new Error('Every project file must have a relative path and base64 content.'), { status: 400 });
		}
		const file = entry.path.replace(/\\/g, '/');
		const segments = file.split('/');
		const lowerSegments = segments.map(segment => segment.toLowerCase());
		const basename = lowerSegments.at(-1) || '';
		if (file.length > 500 || file.startsWith('/') || /^[a-z]:/i.test(file)
			|| segments.some(segment => !segment || segment === '.' || segment === '..')
			|| lowerSegments.some(segment => ['node_modules', '.git', '.next', '.vercel'].includes(segment))
			|| /^\.env(?:\.|$)/i.test(basename)
			|| /^(?:\.npmrc|\.yarnrc|id_rsa.*|credentials(?:\.json)?|\.local-credentials\.json)$/i.test(basename)
			|| /\.(?:pem|key)$/i.test(basename)) {
			throw Object.assign(new Error(`Project file path is unsafe or contains a private file: ${file.slice(0, 120)}.`), { status: 400 });
		}
		if (entry.data.length % 4 !== 0 || !/^[a-z\d+/]*={0,2}$/i.test(entry.data)) {
			throw Object.assign(new Error(`${file} is not valid base64 file data.`), { status: 400 });
		}
		if (seenPaths.has(file)) {
			throw Object.assign(new Error(`Project contains more than one file named ${file}.`), { status: 400 });
		}
		seenPaths.add(file);
		const bytes = Buffer.from(entry.data, 'base64');
		if (bytes.length > MAX_VERCEL_FILE_BYTES) {
			throw Object.assign(new Error(`${file} exceeds the 4 MB per-file limit.`), { status: 413 });
		}
		totalBytes += bytes.length;
		if (totalBytes > MAX_VERCEL_PROJECT_BYTES) {
			throw Object.assign(new Error('The project exceeds the 8 MB upload limit. Remove large assets and try again.'), { status: 413 });
		}
		const text = bytes.toString('utf8');
		if (/\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bsk-[A-Za-z0-9_-]{20,}\b|\bxai-[A-Za-z0-9_-]{20,}\b|\bAKIA[0-9A-Z]{16}\b/.test(text)) {
			throw Object.assign(new Error(`${file} appears to contain a credential. Remove secrets before deploying.`), { status: 400 });
		}
		return { file, data: entry.data };
	});
}

function vercelFramework(files) {
	const packageFile = files.find(entry => entry.file.toLowerCase() === 'package.json');
	if (!packageFile) return null;
	try {
		const manifest = JSON.parse(Buffer.from(packageFile.data, 'base64').toString('utf8'));
		const deps = { ...manifest.dependencies, ...manifest.devDependencies };
		if (deps.next) return 'nextjs';
		if (deps.astro) return 'astro';
		if (deps.vite) return 'vite';
		if (deps['react-scripts']) return 'create-react-app';
		if (deps.nuxt) return 'nuxtjs';
		if (deps.vue) return 'vue';
		if (deps.svelte || deps['@sveltejs/kit']) return 'sveltekit';
		return null;
	} catch {
		throw Object.assign(new Error('The project package.json is invalid JSON.'), { status: 400 });
	}
}

function validateCustomDomain(value) {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string' || value.length > 253 || /[/:?#@\s]/.test(value)) {
		throw Object.assign(new Error('Enter a domain such as www.example.com, without a URL path.'), { status: 400 });
	}
	if (!value.trim()) return null;
	const domain = value.trim().toLowerCase().replace(/\.$/, '');
	if (!domain.includes('.') || !/^(?=.{1,253}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/i.test(domain)) {
		throw Object.assign(new Error('Enter a valid custom domain such as www.example.com.'), { status: 400 });
	}
	return domain;
}

async function vercelApi(pathname, token, body) {
	const response = await fetch(`https://api.vercel.com${pathname}`, {
		method: body ? 'POST' : 'GET',
		headers: {
			authorization: `Bearer ${token}`,
			...(body ? { 'content-type': 'application/json' } : {})
		},
		...(body ? { body: JSON.stringify(body) } : {}),
		signal: AbortSignal.timeout(120000)
	});
	const result = await response.json().catch(() => ({}));
	if (!response.ok) {
		const message = result.error?.message || result.message || `Vercel returned HTTP ${response.status}.`;
		throw Object.assign(new Error(message), { status: response.status });
	}
	return result;
}

async function saveVercelToken(token, credentials) {
	if (typeof token !== 'string' || token.trim().length > 5000) {
		throw Object.assign(new Error('Enter a valid Vercel access token.'), { status: 400 });
	}
	if (!token.trim()) {
		delete credentials.vercelToken;
		writeCredentials(credentials);
		return { connected: false };
	}
	const user = await vercelApi('/v2/user', token.trim());
	credentials.vercelToken = token.trim();
	writeCredentials(credentials);
	return { connected: true, username: user.user?.username || user.user?.name || 'Vercel account' };
}

async function getVercelStatus(credentials) {
	if (!credentials.vercelToken) return { connected: false, message: 'Add a Vercel access token to connect hosting.' };
	try {
		const user = await vercelApi('/v2/user', credentials.vercelToken);
		return { connected: true, username: user.user?.username || user.user?.name || 'Vercel account' };
	} catch (error) {
		return { connected: false, message: `Vercel token check failed: ${error.message}` };
	}
}

async function deployToVercel(body, token, request = vercelApi) {
	if (!token) throw Object.assign(new Error('Connect Vercel with an access token before deploying.'), { status: 401 });
	const name = vercelProjectName(body.name);
	const files = validateVercelFiles(body.files);
	const customDomain = validateCustomDomain(body.customDomain);
	const deployment = await request('/v13/deployments', token, {
		name,
		files: files.map(file => ({ file: file.file, data: file.data, encoding: 'base64' })),
		projectSettings: { framework: vercelFramework(files) },
		target: 'production'
	});
	if (!deployment.url) throw Object.assign(new Error('Vercel accepted the deployment but did not return a URL.'), { status: 502 });
	const result = {
		url: `https://${deployment.url.replace(/^https?:\/\//, '')}`,
		name,
		deploymentId: deployment.id,
		status: deployment.readyState || deployment.status || 'BUILDING',
		projectId: deployment.projectId || null
	};
	if (customDomain) {
		try {
			const target = encodeURIComponent(deployment.projectId || name);
			const domain = await request(`/v10/projects/${target}/domains`, token, { name: customDomain });
			result.customDomain = {
				domain: customDomain,
				verified: Boolean(domain.verified),
				verification: Array.isArray(domain.verification) ? domain.verification : []
			};
		} catch (error) {
			result.customDomainError = error.message;
		}
	}
	return result;
}

function sendJson(response, status, value) {
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'x-content-type-options': 'nosniff'
	});
	response.end(JSON.stringify(value));
}

function readBody(request) {
	return new Promise((resolve, reject) => {
		let size = 0;
		const chunks = [];
		request.on('data', chunk => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
				request.destroy();
				return;
			}
			chunks.push(chunk);
		});
		request.on('end', () => {
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
			} catch {
				reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }));
			}
		});
		request.on('error', reject);
	});
}

function validateAttachments(value) {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) {
		throw Object.assign(new Error(`Attach up to ${MAX_ATTACHMENTS} files per message.`), { status: 400 });
	}
	return value.map(attachment => {
		if (!attachment || typeof attachment.name !== 'string' || attachment.name.length > 200) {
			throw Object.assign(new Error('Each attachment must have a valid file name.'), { status: 400 });
		}
		const name = attachment.name.replace(/[\\/\0-\x1f]/g, '_');
		if (attachment.kind === 'text') {
			if (typeof attachment.text !== 'string' || Buffer.byteLength(attachment.text, 'utf8') > MAX_ATTACHMENT_TEXT) {
				throw Object.assign(new Error(`${name} is too large to include as text (maximum 500 KB).`), { status: 413 });
			}
			return { kind: 'text', name, text: attachment.text };
		}
		const validImageData = data => typeof data === 'string'
			&& Buffer.byteLength(data, 'utf8') <= MAX_ATTACHMENT_BYTES
			&& /^data:image\/(?:jpeg|png|webp|gif);base64,[a-z\d+/]+=*$/i.test(data);
		if (attachment.kind === 'image' && validImageData(attachment.data)) {
			return { kind: 'image', name, data: attachment.data };
		}
		if (attachment.kind === 'audio' && ['mp3', 'wav'].includes(attachment.format)
			&& typeof attachment.data === 'string'
			&& Buffer.byteLength(attachment.data, 'utf8') <= MAX_AUDIO_BYTES
			&& new RegExp(`^data:audio/(?:${attachment.format === 'mp3' ? 'mpeg' : 'wav'}|x-wav);base64,[a-z\\d+/]+=*$`, 'i').test(attachment.data)) {
			return { kind: 'audio', name, format: attachment.format, data: attachment.data };
		}
		if (attachment.kind === 'video' && Array.isArray(attachment.frames) && attachment.frames.length >= 1 && attachment.frames.length <= 6
			&& attachment.frames.every(frame => frame && typeof frame.time === 'number' && Number.isFinite(frame.time) && frame.time >= 0 && validImageData(frame.data))) {
			return {
				kind: 'video',
				name,
				duration: Number.isFinite(attachment.duration) && attachment.duration >= 0 ? attachment.duration : null,
				frames: attachment.frames
			};
		}
		throw Object.assign(new Error(`${name} has an unsupported or invalid attachment format.`), { status: 400 });
	});
}

function messageWithAttachments(text, attachments) {
	if (!attachments.length) return text;
	const content = [{ type: 'text', text }];
	for (const attachment of attachments) {
		if (attachment.kind === 'text') {
			content.push({ type: 'text', text: `\n\nAttached text file: ${attachment.name}\n--- BEGIN FILE ---\n${attachment.text}\n--- END FILE ---` });
		} else if (attachment.kind === 'image') {
			content.push({ type: 'text', text: `\n\nAttached image: ${attachment.name}` });
			content.push({ type: 'image_url', image_url: { url: attachment.data } });
		} else if (attachment.kind === 'audio') {
			content.push({ type: 'text', text: `\n\nAttached audio: ${attachment.name}. Transcribe or analyze it according to the user's request.` });
			content.push({ type: 'input_audio', input_audio: { data: attachment.data.split(',')[1], format: attachment.format } });
		} else {
			content.push({ type: 'text', text: `\n\nAttached video: ${attachment.name}${attachment.duration === null ? '' : ` (${attachment.duration.toFixed(1)} seconds)`}. Analyze these sampled frames in timestamp order.` });
			for (const frame of attachment.frames) {
				content.push({ type: 'text', text: `Video frame at ${frame.time.toFixed(2)} seconds:` });
				content.push({ type: 'image_url', image_url: { url: frame.data } });
			}
		}
	}
	return content;
}

function validateOrigin(request) {
	const origin = request.headers.origin;
	if (!origin) return true;
	try {
		const parsed = new URL(origin);
		return parsed.hostname === HOST && Number(parsed.port) === PORT;
	} catch {
		return false;
	}
}

function validateBaseUrl(value) {
	if (typeof value !== 'string' || value.length > 500) {
		throw Object.assign(new Error('Enter a valid HTTPS-compatible API base URL.'), { status: 400 });
	}
	let url;
	try {
		url = new URL(value);
	} catch {
		throw Object.assign(new Error('Enter a valid API base URL.'), { status: 400 });
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
		throw Object.assign(new Error('API base URLs must use HTTPS and cannot include credentials, query strings, or fragments.'), { status: 400 });
	}
	return url.toString().replace(/\/+$/, '');
}

function extractWebsiteHtml(content) {
	const fence = content.match(/```(?:html)?\s*([\s\S]*?)```/i);
	const source = (fence ? fence[1] : content).trim();
	const start = source.search(/<!doctype html|<html(?:\s|>)/i);
	if (start < 0) {
		throw Object.assign(new Error('The model did not return a complete HTML page. Try again with more detail.'), { status: 502 });
	}
	const html = source.slice(start);
	if (!/<html(?:\s|>)/i.test(html) || !/<body(?:\s|>)/i.test(html) || !/<\/html\s*>/i.test(html)) {
		throw Object.assign(new Error('The generated page is incomplete. Try generating it again.'), { status: 502 });
	}
	if (Buffer.byteLength(html, 'utf8') > MAX_WEBSITE_BYTES) {
		throw Object.assign(new Error('The generated website is too large to publish. Ask for a smaller site.'), { status: 413 });
	}
	return html;
}

function websiteTitle(html) {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	const title = match?.[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
	return (title || 'My website').slice(0, 80);
}

function websiteSlug(title) {
	return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
		.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 38) || 'website';
}

function validateWebsiteForPublish(title, html) {
	if (typeof title !== 'string' || !title.trim() || title.length > 80) {
		throw Object.assign(new Error('Enter a website title with 1 to 80 characters.'), { status: 400 });
	}
	if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > MAX_WEBSITE_BYTES) {
		throw Object.assign(new Error('Website HTML must be under 512 KB.'), { status: 413 });
	}
	const completeHtml = extractWebsiteHtml(html);
	const secretPatterns = [
		/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
		/\bsk-[A-Za-z0-9_-]{20,}\b/,
		/\bxai-[A-Za-z0-9_-]{20,}\b/,
		/\bAKIA[0-9A-Z]{16}\b/
	];
	if (secretPatterns.some(pattern => pattern.test(completeHtml))) {
		throw Object.assign(new Error('This page looks like it contains an API credential. Remove it before publishing.'), { status: 400 });
	}
	return { title: title.trim(), html: completeHtml };
}

function runGh(args, input) {
	return new Promise((resolve, reject) => {
		const executable = process.platform === 'win32' ? 'gh.exe' : 'gh';
		const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', chunk => { stdout += chunk; });
		child.stderr.on('data', chunk => { stderr += chunk; });
		child.on('error', error => {
			if (error.code === 'ENOENT') {
				reject(new Error('GitHub CLI was not found. Install it from https://cli.github.com/ and run Connect Noah Tool AI to GitHub.bat.'));
			} else {
				reject(error);
			}
		});
		child.on('close', code => {
			if (code === 0) {
				resolve(stdout.trim());
			} else {
				const detail = (stderr || stdout).trim().slice(0, 2000);
				if (/not logged in|authentication|oauth|gh auth login/i.test(detail)) {
					reject(new Error('GitHub is not connected yet. Double-click Connect Noah Tool AI to GitHub.bat, finish the sign-in, then try publishing again.'));
				} else {
					reject(new Error(detail || `GitHub CLI exited with code ${code}.`));
				}
			}
		});
		if (input === undefined) child.stdin.end();
		else child.stdin.end(input);
	});
}

async function getGitHubUsername() {
	const username = await runGh(['api', 'user', '--jq', '.login']);
	if (!/^[A-Za-z0-9-]{1,39}$/.test(username)) throw new Error('GitHub returned an invalid account name.');
	return username;
}

async function publishWebsite(title, html) {
	const website = validateWebsiteForPublish(title, html);
	let owner;
	try {
		owner = await getGitHubUsername();
	} catch (error) {
		if (/not found|not connected|sign-in|sign in|authenticate|auth login|login/i.test(error.message)) {
			throw Object.assign(error, { status: 401 });
		}
		throw error;
	}
	const repo = `noah-${websiteSlug(website.title)}-${crypto.randomBytes(3).toString('hex')}`;
	const created = JSON.parse(await runGh(['api', '--method', 'POST', 'user/repos', '--input', '-'], JSON.stringify({
		name: repo,
		description: `Static website published from Noah Tool AI: ${website.title}`.slice(0, 350),
		private: false,
		auto_init: true
	})));
	const defaultBranch = created.default_branch || 'main';
	const repository = `${owner}/${repo}`;
	try {
		await runGh(['api', '--method', 'PUT', `repos/${repository}/contents/index.html`, '--input', '-'], JSON.stringify({
			message: 'Publish website',
			content: Buffer.from(website.html, 'utf8').toString('base64'),
			branch: defaultBranch
		}));
		const pages = JSON.parse(await runGh(['api', '--method', 'POST', `repos/${repository}/pages`, '--input', '-'], JSON.stringify({
			source: { branch: defaultBranch, path: '/' }
		})));
		return {
			url: pages.html_url || `https://${owner.toLowerCase()}.github.io/${repo}/`,
			repositoryUrl: created.html_url,
			status: pages.status || 'building'
		};
	} catch (error) {
		throw Object.assign(new Error(`GitHub created the public repository, but could not finish enabling Pages. Repository: ${created.html_url}. ${error.message}`), { status: 502 });
	}
}

async function generateWebsite(body, credentials, complete = requestCompletion) {
	const attachments = validateAttachments(body.attachments);
	const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
	if ((!prompt && !attachments.length) || prompt.length > 20000) {
		throw Object.assign(new Error('Describe the website you want in up to 20,000 characters, or attach a reference file.'), { status: 400 });
	}
	const catalog = readCatalog();
	const history = Array.isArray(body.messages)
		? body.messages
			.filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string' && message.content.length <= 100000)
			.slice(-20)
		: [];
	if (prompt && !history.some(message => message.role === 'user' && message.content === prompt)) {
		history.push({ role: 'user', content: prompt });
	} else if (!history.length || history.at(-1).role !== 'user') {
		history.push({ role: 'user', content: prompt || 'Create a polished website inspired by the attached reference.' });
	}
	const hasVisualInput = attachments.some(attachment => attachment.kind === 'image' || attachment.kind === 'video');
	const hasAudioInput = attachments.some(attachment => attachment.kind === 'audio');
	const messages = [
		{ role: 'system', content: WEBSITE_SYSTEM_PROMPT },
		...(hasVisualInput ? [{ role: 'system', content: 'The user attached visual input. Inspect it as a reference for the requested website.' }] : []),
		...(hasAudioInput ? [{ role: 'system', content: 'The user attached audio input. Use it as reference material for the requested website where relevant.' }] : []),
		...history
	];
	const supportsVision = candidate => /\b(vision|image|multimodal|text\s*\+\s*vision|vl\b)\b/i.test(`${candidate.model.modality || ''} ${candidate.model.name || ''}`);
	const supportsAudio = candidate => /\b(audio|speech|multimodal)\b/i.test(`${candidate.model.modality || ''} ${candidate.model.name || ''}`);
	const candidates = getModelCandidates(catalog, credentials, messages, body.model || 'auto', 'auto')
		.filter(candidate => (!hasVisualInput || supportsVision(candidate)) && (!hasAudioInput || supportsAudio(candidate)));
	const reviewCandidates = getModelCandidates(catalog, credentials, messages, 'auto', 'auto')
		.filter(candidate => (!hasVisualInput || supportsVision(candidate)) && (!hasAudioInput || supportsAudio(candidate)));
	if (!candidates.length) {
		const required = [hasVisualInput ? 'vision' : '', hasAudioInput ? 'audio' : ''].filter(Boolean).join(' and ');
		throw Object.assign(new Error(`No configured ${required}-capable model matches these attachments. Choose a compatible model or add a provider that supports this media input.`), { status: 400 });
	}
	const lastUserIndex = messages.findLastIndex(message => message.role === 'user');
	const requestMessages = messages.map((message, index) => index === lastUserIndex
		? { ...message, content: messageWithAttachments(message.content, attachments) }
		: message);
	const draft = await callWithFailover(candidates, credentials, requestMessages, complete);
	let reviewed = await reviewCodeDraft(draft, reviewCandidates, credentials, requestMessages, complete, true);
	let html;
	try {
		html = extractWebsiteHtml(reviewed.content);
	} catch (error) {
		if (reviewed.reviewStatus !== 'reviewed') throw error;
		reviewed = { ...draft, reviewStatus: 'unavailable', reviewError: `The reviewer returned invalid HTML, so the original draft was kept. ${error.message}` };
		html = extractWebsiteHtml(draft.content);
	}
	return {
		html,
		title: websiteTitle(html),
		provider: draft.provider,
		model: draft.model,
		reviewStatus: reviewed.reviewStatus,
		reviewedBy: reviewed.reviewedBy,
		reviewError: reviewed.reviewError
	};
}

function isCodeTask(messages) {
	const prompt = [...messages].reverse().find(message => message.role === 'user')?.content || '';
	const asksToBuild = /\b(write|create|build|make|generate|implement|program|fix|debug|refactor|develop|animate|render)\b/i.test(prompt);
	const artifact = /\b(code|script|website|web\s?app|html|css|javascript|python|pytorch|grad.cam|objectron|3d|cad|luau|roblox|animation|tool|app|tracker|calculator|bot|function|component|game|video|deck|slides?|presentation|powerpoint|voice|audio|tts|workflow|comfyui|opencli|automation)\b/i.test(prompt);
	return asksToBuild && artifact;
}

async function reviewCodeDraft(draft, candidates, credentials, messages, complete = requestCompletion, requireCompleteHtml = false) {
	const reviewerCandidates = candidates.filter(candidate => candidate.provider.name !== draft.provider);
	if (!reviewerCandidates.length) {
		return { ...draft, reviewStatus: 'unavailable', reviewError: 'A second distinct provider is required for code review.' };
	}
	const reviewRequest = requireCompleteHtml
		? 'Independently critique this generated website against the full user brief. Improve visual hierarchy, typography, spacing, palette, composition, responsive layouts, accessibility, and consistency of its design tokens; preserve the intended style and make the controls and interactions work. Fix concrete defects rather than only listing feedback. Return the complete corrected HTML document only, beginning with <!doctype html>.'
		: "Review the preceding draft independently against the user's complete request, including the actual goal, constraints, audience, accuracy, completeness, and whether an important useful detail is missing. Correct or clarify weak parts and expand relevant gaps, but do not pad the answer or exceed the requested scope. Return the complete improved answer, not review notes.";
	try {
		const reviewed = await callWithFailover(
			reviewerCandidates,
			credentials,
			[
				...messages.filter(message => message.role === 'system'),
				{ role: 'system', content: CODE_REVIEW_PROMPT },
				...messages.filter(message => message.role !== 'system'),
				{ role: 'assistant', content: draft.content },
				{ role: 'user', content: reviewRequest }
			],
			complete
		);
		return {
			...draft,
			content: reviewed.content,
			reviewStatus: 'reviewed',
			reviewedBy: { provider: reviewed.provider, model: reviewed.model }
		};
	} catch (error) {
		return { ...draft, reviewStatus: 'unavailable', reviewError: error.message };
	}
}

function getModelCandidates(catalog, credentials, messages, requestedModel, mode) {
	const latestUserMessage = [...messages].reverse().find(message => message.role === 'user')?.content || '';
	const prompt = latestUserMessage.toLowerCase();
	const task = analyzeTask(messages);
	const coding = ['coding', 'design'].includes(task.type) || /\b(website|web app|html|css|javascript|python|pytorch|grad.cam|objectron|3d|cad|animation|gsap|comfyui|dify|workflow|browser automation|opencli|game|script)\b/.test(prompt);
	const reasoning = ['research', 'reasoning', 'presentation'].includes(task.type);
	const visual = task.type === 'visual' || messages.some(message => message.role === 'system' && /attached visual input/i.test(message.content));
	const media = task.type === 'media';
	const creative = ['creative', 'design', 'presentation', 'media'].includes(task.type);
	const fast = /\b(quick|brief|short|simple|capital of|what is|who is)\b/.test(prompt);
	const [requestedProvider, requestedId] = requestedModel && requestedModel !== 'auto'
		? requestedModel.split('::', 2)
		: [null, null];
	const providers = catalog.providers.filter(provider => {
		const setting = credentials[provider.name];
		return setting && (setting.anonymous || setting.apiKeys.length) && setting.baseUrl;
	});
	const candidates = [];

	for (const provider of providers) {
		for (const model of provider.models) {
			if (!model.id) continue;
			if (requestedId && (provider.name !== requestedProvider || model.id !== requestedId)) continue;
			let score = 0;
			const identity = `${provider.name} ${model.name} ${model.modality}`.toLowerCase();
			if (provider.name === 'Kilo Code' && model.id === 'kilo-auto/free') score += 3;
			if (coding && /\b(code|codestral|coder|program)\b/.test(identity)) score += 5;
			if (reasoning && /reason|think|instruct|large|pro\b/.test(identity)) score += 3;
			if (visual && /vision|visual|image|multimodal|vl\b/.test(identity)) score += 5;
			if (media && /video|audio|music|voice|creative|multimodal|generation/.test(identity)) score += 5;
			if (creative && /creative|vision|multimodal|large|pro\b/.test(identity)) score += 2;
			if (task.type === 'design' && /\b(code|coder|vision|creative|multimodal)\b/.test(identity)) score += 2;
			if (task.type === 'presentation' && /\b(code|coder|reason|think|large|pro\b)\b/.test(identity)) score += 2;
			if (fast && /mini|flash|lite|small|fast|llama-3\.1-8b/.test(identity)) score += 2;
			if (provider.name === 'xAI (Grok)') score += 1;
			candidates.push({ provider, model, score });
		}
	}
	candidates.sort((left, right) => right.score - left.score);
	if (mode === 'compare') {
		const distinct = [];
		const seen = new Set();
		for (const candidate of candidates) {
			if (seen.has(candidate.provider.name)) continue;
			distinct.push(candidate);
			seen.add(candidate.provider.name);
			if (distinct.length === 2) break;
		}
		return distinct;
	}
	return candidates;
}

function compatibleBaseUrl(provider, baseUrl) {
	if (provider.name === 'Google Gemini' && baseUrl === provider.baseUrl) {
		return 'https://generativelanguage.googleapis.com/v1beta/openai';
	}
	if (provider.name === 'Cohere' && baseUrl === provider.baseUrl) {
		return 'https://api.cohere.ai/compatibility/v1';
	}
	if (provider.name === 'Cloudflare Workers AI' && baseUrl.includes('/ai/run')) {
		return baseUrl.replace(/\/ai\/run\/?$/, '/ai/v1');
	}
	return baseUrl;
}

function buildRequestHeaders(setting, keyIndex) {
	const headers = { 'content-type': 'application/json' };
	if (setting.apiKeys.length) headers.authorization = `Bearer ${setting.apiKeys[keyIndex]}`;
	return headers;
}

async function requestCompletion(candidate, setting, keyIndex, messages) {
	const baseUrl = compatibleBaseUrl(candidate.provider, setting.baseUrl);
	if (baseUrl.includes('{') || baseUrl.includes('}')) {
		throw Object.assign(new Error('Replace placeholders in this provider’s API base URL in Settings.'), { status: 400 });
	}
	const response = await fetch(`${baseUrl}/chat/completions`, {
		method: 'POST',
		headers: buildRequestHeaders(setting, keyIndex),
		body: JSON.stringify({
			model: candidate.model.id,
			messages,
			stream: false
		}),
		signal: AbortSignal.timeout(90000)
	});
	const result = await response.json().catch(() => ({}));
	if (!response.ok) {
		const message = result.error?.message || result.message || `Provider returned HTTP ${response.status}.`;
		throw Object.assign(new Error(message), { status: response.status });
	}
	const content = result.choices?.[0]?.message?.content;
	if (typeof content !== 'string' || !content.trim()) {
		throw Object.assign(new Error('Provider returned an empty or unsupported response.'), { status: 502 });
	}
	return { content, model: result.model };
}

async function callWithFailover(candidates, credentials, messages, complete = requestCompletion) {
	const errors = [];
	const failedProviders = new Set();
	for (const candidate of candidates) {
		if (failedProviders.has(candidate.provider.name)) continue;
		const setting = credentials[candidate.provider.name];
		if (!setting) continue;
		let failedBeforeSuccess = false;
		const startKey = setting.nextKey;
		const attemptCount = setting.apiKeys.length || (setting.anonymous ? 1 : 0);
		for (let offset = 0; offset < attemptCount; offset++) {
			const keyIndex = setting.apiKeys.length ? (startKey + offset) % setting.apiKeys.length : 0;
			try {
				const completion = await complete(candidate, setting, keyIndex, messages);
				const content = typeof completion === 'string' ? completion : completion.content;
				if (typeof content !== 'string' || !content.trim()) {
					throw Object.assign(new Error('Provider returned an empty or unsupported response.'), { status: 502 });
				}
				if (setting.apiKeys.length) {
					setting.nextKey = failedBeforeSuccess ? keyIndex : (keyIndex + 1) % setting.apiKeys.length;
				}
				return {
					content,
					provider: candidate.provider.name,
					model: typeof completion === 'object' && completion.model ? completion.model : candidate.model.name
				};
			} catch (error) {
				errors.push(`${candidate.provider.name} (${candidate.model.name}): ${error.message}`);
				failedBeforeSuccess = true;
				if (setting.apiKeys.length) setting.nextKey = (keyIndex + 1) % setting.apiKeys.length;
				if ([401, 403, 429].includes(error.status)) failedProviders.add(candidate.provider.name);
				if (![401, 403, 408, 429, 500, 502, 503, 504].includes(error.status)) break;
			}
		}
	}
	const error = new Error(errors.length ? errors.join('\n') : 'No configured provider can run this request. Add a provider key in Settings.');
	error.status = errors.length ? 502 : 400;
	throw error;
}

async function handleChat(body, credentials, complete = requestCompletion) {
	if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100) {
		throw Object.assign(new Error('A chat must contain between 1 and 100 messages.'), { status: 400 });
	}
	for (const message of body.messages) {
		if (!message || !['user', 'assistant', 'system'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 100000) {
			throw Object.assign(new Error('Chat messages must have a supported role and text content under 100,000 characters.'), { status: 400 });
		}
	}
	const attachments = validateAttachments(body.attachments);
	const catalog = readCatalog();
	const specialty = ['design', 'comfyui', 'dify', 'investigation', 'browser', 'explainability', 'objectron', 'cad', 'animation', 'video', 'presentation', 'voice'].includes(body.mode) ? body.mode : null;
	const mode = body.mode === 'compare' ? 'compare' : specialty || 'auto';
	const task = analyzeTask(body.messages);
	const hasVisualInput = attachments.some(attachment => attachment.kind === 'image' || attachment.kind === 'video');
	const hasAudioInput = attachments.some(attachment => attachment.kind === 'audio');
	const messages = [
		{ role: 'system', content: CHAT_SYSTEM_PROMPT },
		{ role: 'system', content: `Internal task routing assessed this request as "${task.type}". Use the approach and level of detail best suited to that deliverable, verify the response against the user's actual requirements, and expand relevant gaps without padding or overriding explicit scope. This is only a routing aid; follow the user's request if it does not fit the category.` },
		...(hasVisualInput ? [{ role: 'system', content: 'The user attached visual input. Inspect the provided image or sampled video frames and base visual observations on those attachments.' }] : []),
		...(hasAudioInput ? [{ role: 'system', content: 'The user attached audio input. Analyze or transcribe it according to the user request.' }] : []),
		...(specialty ? [{ role: 'system', content: SPECIALTY_SYSTEM_PROMPTS[specialty] }] : []),
		...body.messages.filter(message => message.role !== 'system')
	];
	const supportsVision = candidate => /\b(vision|image|multimodal|text\s*\+\s*vision|vl\b)\b/i.test(`${candidate.model.modality || ''} ${candidate.model.name || ''}`);
	const supportsAudio = candidate => /\b(audio|speech|multimodal)\b/i.test(`${candidate.model.modality || ''} ${candidate.model.name || ''}`);
	const routingCandidates = getModelCandidates(catalog, credentials, messages, body.model || 'auto', mode);
	const supportsAttachments = candidate => (!hasVisualInput || supportsVision(candidate)) && (!hasAudioInput || supportsAudio(candidate));
	const candidates = hasVisualInput || hasAudioInput ? routingCandidates.filter(supportsAttachments) : routingCandidates;
	const reviewCandidates = getModelCandidates(catalog, credentials, messages, 'auto', 'auto')
		.filter(supportsAttachments);
	if (!candidates.length) {
		const error = hasVisualInput || hasAudioInput
			? `No configured ${[hasVisualInput ? 'vision' : '', hasAudioInput ? 'audio' : ''].filter(Boolean).join(' and ')}-capable model matches these attachments. Choose a compatible model or add a provider that supports this media input.`
			: 'No matching model is configured. Add a provider key or choose Auto.';
		throw Object.assign(new Error(error), { status: 400 });
	}
	const lastUserIndex = messages.findLastIndex(message => message.role === 'user');
	const requestMessages = messages.map((message, index) => index === lastUserIndex
		? { ...message, content: messageWithAttachments(message.content, attachments) }
		: message);
	if (mode !== 'compare') {
		const draft = await callWithFailover(candidates, credentials, requestMessages, complete);
		return shouldReviewAnswer(messages)
			? reviewCodeDraft(draft, reviewCandidates, credentials, requestMessages, complete)
			: draft;
	}
	if (candidates.length < 2) {
		throw Object.assign(new Error('Compare & combine needs API keys for at least two providers.'), { status: 400 });
	}
	const outputs = await Promise.all(candidates.map(async candidate => ({
		...await callWithFailover([candidate], credentials, requestMessages, complete),
		candidate
	})));
	const synthesisMessages = [
		...requestMessages.filter(message => message.role !== 'assistant'),
		{
			role: 'user',
			content: `Answer the user's request using these independent drafts. Combine their strongest points, resolve disagreements carefully, and do not claim facts that are unsupported by the drafts.\n\n${outputs.map(output => `Draft from ${output.provider} (${output.model}):\n${output.content}`).join('\n\n')}`
		}
	];
	const synthesis = await callWithFailover([candidates[0]], credentials, synthesisMessages, complete);
	const result = { ...synthesis, contributors: outputs.map(({ provider, model }) => ({ provider, model })) };
	return shouldReviewAnswer(messages)
		? reviewCodeDraft(result, reviewCandidates, credentials, requestMessages, complete)
		: result;
}

function serveStatic(request, response) {
	const pathname = decodeURIComponent(new URL(request.url, `http://${HOST}:${PORT}`).pathname);
	const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
	const file = path.resolve(PUBLIC_DIR, relative);
	if (!file.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
		response.writeHead(403);
		response.end('Forbidden');
		return;
	}
	fs.readFile(file, (error, content) => {
		if (error) {
			response.writeHead(404);
			response.end('Not found');
			return;
		}
		const type = file.endsWith('.html') ? 'text/html; charset=utf-8'
			: file.endsWith('.css') ? 'text/css; charset=utf-8'
				: file.endsWith('.js') ? 'text/javascript; charset=utf-8'
					: 'application/octet-stream';
		response.writeHead(200, {
			'content-type': type,
			'cache-control': 'no-store',
			'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-src data:; base-uri 'none'; frame-ancestors 'none'",
			'x-content-type-options': 'nosniff'
		});
		response.end(content);
	});
}

function createServer() {
	return http.createServer(async (request, response) => {
		if (!validateOrigin(request)) {
			sendJson(response, 403, { error: 'Requests must come from this local app.' });
			return;
		}
		try {
			const url = new URL(request.url, `http://${HOST}:${PORT}`);
			if (request.method === 'GET' && url.pathname === '/api/catalog') {
				sendJson(response, 200, readCatalog());
			} else if (request.method === 'GET' && url.pathname === '/api/settings') {
				sendJson(response, 200, publicSettings(readCredentials()));
			} else if (request.method === 'GET' && url.pathname === '/api/github/status') {
				try {
					const username = await getGitHubUsername();
					sendJson(response, 200, { connected: true, username });
				} catch (error) {
					sendJson(response, 200, { connected: false, message: error.message });
				}
			} else if (request.method === 'GET' && url.pathname === '/api/vercel/status') {
				sendJson(response, 200, await getVercelStatus(readCredentials()));
			} else if (request.method === 'PUT' && url.pathname === '/api/vercel/token') {
				const body = await readBody(request);
				sendJson(response, 200, await saveVercelToken(body.token, readCredentials()));
			} else if (request.method === 'POST' && url.pathname === '/api/vercel/deploy') {
				const credentials = readCredentials();
				sendJson(response, 200, await deployToVercel(await readBody(request), credentials.vercelToken));
			} else if (request.method === 'PUT' && url.pathname === '/api/settings') {
				const body = await readBody(request);
				if (typeof body.provider !== 'string' || !body.provider.trim()) throw Object.assign(new Error('Choose a provider.'), { status: 400 });
				const catalog = readCatalog();
				if (!catalog.providers.some(provider => provider.name === body.provider)) {
					throw Object.assign(new Error('Unknown provider.'), { status: 400 });
				}
				const keys = typeof body.apiKeys === 'string'
					? body.apiKeys.split(/\r?\n/).map(key => key.trim()).filter(Boolean)
					: [];
				if (keys.some(key => key.length > 500)) throw Object.assign(new Error('API keys must be 500 characters or less.'), { status: 400 });
				const baseUrl = validateBaseUrl(body.baseUrl);
				const credentials = readCredentials();
				const existing = credentials[body.provider];
				const apiKeys = [...new Set([...(existing?.apiKeys || []), ...keys])];
				if (apiKeys.length > 20) throw Object.assign(new Error('A provider can have up to 20 API keys.'), { status: 400 });
				const anonymous = ANONYMOUS_PROVIDERS.has(body.provider) && !apiKeys.length;
				if (!apiKeys.length && !anonymous) throw Object.assign(new Error('This provider requires an API key.'), { status: 400 });
				credentials[body.provider] = { apiKeys, baseUrl, nextKey: existing?.nextKey || 0, anonymous };
				writeCredentials(credentials);
				sendJson(response, 200, publicSettings(credentials));
			} else if (request.method === 'DELETE' && url.pathname === '/api/settings') {
				const provider = url.searchParams.get('provider');
				const credentials = readCredentials();
				if (provider) delete credentials[provider];
				writeCredentials(credentials);
				sendJson(response, 200, publicSettings(credentials));
			} else if (request.method === 'POST' && url.pathname === '/api/chat') {
				const credentials = readCredentials();
				try {
					const result = await handleChat(await readBody(request), credentials);
					sendJson(response, 200, result);
				} finally {
					writeCredentials(credentials);
				}
			} else if (request.method === 'POST' && url.pathname === '/api/website/generate') {
				const credentials = readCredentials();
				try {
					const result = await generateWebsite(await readBody(request), credentials);
					sendJson(response, 200, result);
				} finally {
					writeCredentials(credentials);
				}
			} else if (request.method === 'POST' && url.pathname === '/api/website/publish') {
				const body = await readBody(request);
				sendJson(response, 200, await publishWebsite(body.title, body.html));
			} else if (url.pathname.startsWith('/api/')) {
				sendJson(response, 404, { error: 'API route not found.' });
			} else if (request.method === 'GET') {
				serveStatic(request, response);
			} else {
				sendJson(response, 405, { error: 'Method not allowed.' });
			}
		} catch (error) {
			sendJson(response, error.status || 500, { error: error.message || 'The local app encountered an error.' });
		}
	});
}

if (require.main === module) {
	createServer().listen(PORT, HOST, () => {
		console.log(`Noah Tool AI is running at http://${HOST}:${PORT}`);
	});
}

module.exports = {
	createServer,
	readCatalog,
	getModelCandidates,
	compatibleBaseUrl,
	validateBaseUrl,
	handleChat,
	callWithFailover,
	anonymousSettings,
	buildRequestHeaders,
	vercelProjectName,
	validateVercelFiles,
	vercelFramework,
	validateCustomDomain,
	saveVercelToken,
	getVercelStatus,
	deployToVercel,
	validateAttachments,
	messageWithAttachments,
	analyzeTask,
	isCodeTask,
	shouldReviewAnswer,
	reviewCodeDraft,
	extractWebsiteHtml,
	websiteTitle,
	websiteSlug,
	validateWebsiteForPublish,
	generateWebsite,
	publishWebsite,
	getGitHubUsername
};
