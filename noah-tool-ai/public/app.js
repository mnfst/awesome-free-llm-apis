'use strict';

const STORAGE_KEY = 'noah-tool-ai.workspace.v1';
const byId = id => document.getElementById(id);
const elements = {
	activeProjectLabel: byId('active-project-label'),
	apiKeys: byId('api-keys'),
	backToChat: byId('back-to-chat'),
	baseUrl: byId('base-url'),
	chatList: byId('chat-list'),
	chatTitle: byId('chat-title'),
	composer: byId('composer'),
	composerHint: byId('composer-hint'),
	connectionStatus: byId('connection-status'),
	conversationView: byId('conversation-view'),
	messageList: byId('messages'),
	modeSelect: byId('mode-select'),
	modelSelect: byId('model-select'),
	newChat: byId('new-chat'),
	newProject: byId('new-project'),
	prompt: byId('prompt'),
	projectList: byId('project-list'),
	providerCount: byId('provider-count'),
	providerDescription: byId('provider-description'),
	providerForm: byId('provider-form'),
	providerFormTitle: byId('provider-form-title'),
	providerList: byId('settings-provider-list'),
	keyHelp: byId('key-help'),
	removeProvider: byId('remove-provider'),
	saveProvider: byId('save-provider'),
	selectedProvider: null,
	settingsButton: byId('settings-button'),
	hostingButton: byId('hosting-button'),
	settingsView: byId('settings-view'),
	hostingView: byId('hosting-view'),
	hostingBack: byId('hosting-back'),
	vercelToken: byId('vercel-token'),
	saveVercelToken: byId('save-vercel-token'),
	vercelStatus: byId('vercel-status'),
	vercelProjectName: byId('vercel-project-name'),
	vercelDomain: byId('vercel-domain'),
	chooseProjectFolder: byId('choose-project-folder'),
	projectFolderInput: byId('project-folder-input'),
	projectFolderStatus: byId('project-folder-status'),
	deployVercel: byId('deploy-vercel'),
	vercelDeployStatus: byId('vercel-deploy-status'),
	websiteReviewView: byId('website-review-view'),
	websiteTitle: byId('website-title'),
	websiteHtml: byId('website-html'),
	websitePreview: byId('website-preview-frame'),
	websiteCancel: byId('cancel-website'),
	websiteUpdatePreview: byId('update-preview'),
	websitePublish: byId('publish-website'),
	websiteReviewStatus: byId('website-review-status'),
	githubStatus: byId('github-status'),
	publishStatus: byId('publish-status'),
	sendButton: byId('send-button'),
	welcomeCard: byId('welcome-card'),
	workspaceStatus: byId('workspace-status'),
	appToast: byId('app-toast')
};
elements.attachButton = byId('attach-button');
elements.fileInput = byId('file-input');
elements.pendingAttachments = byId('pending-attachments');

let catalog = { providers: [] };
let settings = {};
let workspaceLoadError = '';
let toastTimeout;
let workspace = loadWorkspace();
let pendingFiles = [];
let selectedProjectFiles = [];

function showToast(message, isError = false) {
	window.clearTimeout(toastTimeout);
	elements.appToast.textContent = message;
	elements.appToast.classList.toggle('error', isError);
	elements.appToast.setAttribute('role', isError ? 'alert' : 'status');
	elements.appToast.hidden = false;
	toastTimeout = window.setTimeout(() => {
		elements.appToast.hidden = true;
	}, 4500);
}

function loadWorkspace() {
	try {
		const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
		const projects = Array.isArray(value.projects)
			? value.projects.filter(project => project && typeof project.id === 'string' && typeof project.name === 'string')
			: [];
		const projectIds = new Set(projects.map(project => project.id));
		const chats = Array.isArray(value.chats)
			? value.chats.filter(chat => chat && typeof chat.id === 'string' && Array.isArray(chat.messages))
				.map(chat => ({
					...chat,
					title: typeof chat.title === 'string' ? chat.title : 'New chat',
					projectId: projectIds.has(chat.projectId) ? chat.projectId : null,
					createdAt: Number.isFinite(chat.createdAt) ? chat.createdAt : Date.now(),
					updatedAt: Number.isFinite(chat.updatedAt) ? chat.updatedAt : Date.now(),
					messages: chat.messages
						.filter(message => message && ['user', 'assistant'].includes(message.role) && typeof message.content === 'string')
						.map(message => message.pending
							? { ...message, content: 'This response was interrupted before it finished. You can send your prompt again.', pending: false, error: true }
							: message)
				}))
			: [];
		const selectedProjectId = projectIds.has(value.selectedProjectId) ? value.selectedProjectId : null;
		const selectedChatId = chats.some(chat => chat.id === value.selectedChatId) ? value.selectedChatId : null;
		return {
			projects,
			chats,
			selectedChatId,
			selectedProjectId,
			selectedModel: value.selectedModel || 'auto',
			mode: ['auto', 'selected', 'compare', 'website', 'design', 'dify', 'browser', 'comfyui', 'investigation', 'explainability', 'objectron', 'cad', 'animation', 'video', 'presentation', 'voice'].includes(value.mode) ? value.mode : 'auto'
		};
	} catch (error) {
		workspaceLoadError = `Could not load saved chats (${error.message}). Your previous browser data was left untouched.`;
		return { projects: [], chats: [], selectedChatId: null, selectedProjectId: null, selectedModel: 'auto', mode: 'auto' };
	}
}

function selectProject(projectId) {
	workspace.selectedProjectId = projectId;
	const current = activeChat();
	if (projectId && current?.projectId !== projectId) {
		const latest = workspace.chats
			.filter(chat => chat.projectId === projectId)
			.sort((left, right) => right.updatedAt - left.updatedAt)[0];
		workspace.selectedChatId = latest?.id || null;
	}
	if (projectId && !activeChat()) {
		createChat();
		return;
	}
	persistWorkspace();
	renderWorkspace();
}

function persistWorkspace() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
		elements.workspaceStatus.hidden = true;
		elements.workspaceStatus.textContent = '';
		return true;
	} catch (error) {
		const message = error.name === 'QuotaExceededError'
			? 'Browser storage is full. Delete older chats or websites before continuing; new changes may not be saved.'
			: `Could not save chats in this browser: ${error.message}`;
		elements.workspaceStatus.textContent = message;
		elements.workspaceStatus.hidden = false;
		return false;
	}
}

function newId() {
	return crypto.randomUUID();
}

function activeChat() {
	return workspace.chats.find(chat => chat.id === workspace.selectedChatId) || null;
}

function activeProject() {
	return workspace.projects.find(project => project.id === workspace.selectedProjectId) || null;
}

function addText(parent, tag, text, className) {
	const node = document.createElement(tag);
	node.textContent = text;
	if (className) node.className = className;
	parent.append(node);
	return node;
}

function providerDefaultUrl(provider) {
	if (provider.name === 'Google Gemini') return 'https://generativelanguage.googleapis.com/v1beta/openai';
	if (provider.name === 'Cohere') return 'https://api.cohere.ai/compatibility/v1';
	if (provider.name === 'Cloudflare Workers AI') return provider.baseUrl.replace(/\/ai\/run\/?$/, '/ai/v1');
	return provider.baseUrl || '';
}

async function api(path, options = {}) {
	const response = await fetch(path, {
		...options,
		headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers }
	});
	const result = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(result.error || `Local app returned HTTP ${response.status}.`);
	return result;
}

function renderProjects() {
	elements.projectList.replaceChildren();
	const allRow = document.createElement('button');
	allRow.type = 'button';
	allRow.className = `project-item${workspace.selectedProjectId ? '' : ' active'}`;
	allRow.textContent = 'All chats';
	allRow.addEventListener('click', () => selectProject(null));
	elements.projectList.append(allRow);
	if (!workspace.projects.length) {
		addText(elements.projectList, 'div', 'Create a project to group chats.', 'empty-list');
		return;
	}
	for (const project of workspace.projects) {
		const row = document.createElement('div');
		row.className = 'project-row';
		const button = document.createElement('button');
		button.type = 'button';
		button.className = `project-item${project.id === workspace.selectedProjectId ? ' active' : ''}`;
		button.textContent = `▦  ${project.name}`;
		button.title = project.name;
		button.addEventListener('click', () => selectProject(project.id));
		const rename = document.createElement('button');
		rename.type = 'button';
		rename.className = 'project-rename';
		rename.textContent = '…';
		rename.title = 'Rename project';
		rename.setAttribute('aria-label', `Rename ${project.name}`);
		rename.addEventListener('click', () => renameProject(project));
		row.append(button, rename);
		elements.projectList.append(row);
	}
}

function renderChats() {
	elements.chatList.replaceChildren();
	const chats = workspace.chats
		.filter(chat => !workspace.selectedProjectId || chat.projectId === workspace.selectedProjectId)
		.sort((left, right) => right.updatedAt - left.updatedAt);
	if (!chats.length) {
		addText(elements.chatList, 'div', workspace.selectedProjectId ? 'No chats in this project yet.' : 'Your conversations will appear here.', 'empty-list');
		return;
	}
	for (const chat of chats) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = `chat-item${chat.id === workspace.selectedChatId ? ' active' : ''}`;
		button.addEventListener('click', () => {
			workspace.selectedChatId = chat.id;
			persistWorkspace();
			renderWorkspace();
		});
		addText(button, 'span', chat.title || 'New chat', 'chat-item-title');
		addText(button, 'span', chat.messages.length ? `${chat.messages.length} messages` : 'New conversation', 'chat-item-meta');
		elements.chatList.append(button);
	}
}

function renderModels() {
	const previous = workspace.selectedModel;
	elements.modelSelect.replaceChildren();
	const automatic = document.createElement('option');
	automatic.value = 'auto';
	automatic.textContent = 'Auto — choose for my task';
	elements.modelSelect.append(automatic);
	for (const provider of catalog.providers) {
		const connected = settings[provider.name]?.connected;
		if (!connected) continue;
		const group = document.createElement('optgroup');
		group.label = provider.name;
		for (const model of provider.models) {
			if (!model.id) continue;
			const option = document.createElement('option');
			option.value = `${provider.name}::${model.id}`;
			option.textContent = model.name;
			group.append(option);
		}
		elements.modelSelect.append(group);
	}
	if ([...elements.modelSelect.options].some(option => option.value === previous)) {
		elements.modelSelect.value = previous;
	} else {
		workspace.selectedModel = 'auto';
		elements.modelSelect.value = 'auto';
	}
	elements.modeSelect.value = workspace.mode;
	const connectedCount = Object.values(settings).filter(value => value.connected).length;
	elements.composerHint.textContent = connectedCount
		? `${connectedCount} providers ready · Auto routes by task; substantial answers get independent review when available`
		: 'Free providers unavailable. Add a provider key in Settings to start chatting.';
}

function renderMessages() {
	const chat = activeChat();
	elements.messageList.replaceChildren();
	if (!chat || !chat.messages.length) {
		const welcome = document.createElement('div');
		welcome.className = 'welcome-card';
		addText(welcome, 'div', '✳', 'welcome-icon');
		addText(welcome, 'p', 'YOUR AI WORKSPACE', 'eyebrow');
		addText(welcome, 'h2', 'What would you like to make?');
		addText(welcome, 'p', 'Ask a question, build a website, explore an idea, or compare answers from multiple providers.');
		const suggestions = document.createElement('div');
		suggestions.className = 'suggestions';
		for (const [label, prompt] of [
			['Get a quick answer', 'What is the capital of France?'],
			['Build a website', 'Help me plan and build a small website for my project.'],
			['Compare ideas', 'Compare a few approaches to organizing a new project.']
		]) {
			const button = document.createElement('button');
			button.type = 'button';
			addText(button, 'span', label);
			addText(button, 'span', '↗');
			button.addEventListener('click', () => {
				elements.prompt.value = prompt;
				elements.prompt.focus();
				resizePrompt();
			});
			suggestions.append(button);
		}
		welcome.append(suggestions);
		elements.messageList.append(welcome);
		return;
	}
	for (const message of chat.messages) {
		const item = document.createElement('article');
		item.className = `message ${message.role}${message.error ? ' error' : ''}`;
		addText(item, 'div', message.role === 'user' ? 'Y' : 'N', 'message-avatar');
		const body = document.createElement('div');
		body.className = 'message-body';
		addText(body, 'div', message.pending ? 'Working' : message.role === 'user' ? 'You' : 'Noah Tool AI', 'message-label');
		if (message.pending) {
			const status = document.createElement('div');
			status.className = 'message-content typing';
			status.setAttribute('role', 'status');
			const spinner = document.createElement('span');
			spinner.className = 'loading-spinner';
			spinner.setAttribute('aria-hidden', 'true');
			status.append(spinner, document.createTextNode(message.content));
			body.append(status);
		} else {
			addText(body, 'div', message.content, 'message-content');
		}
		if (message.attachments?.length) {
			const attachmentList = document.createElement('div');
			attachmentList.className = 'message-attachments';
			for (const attachment of message.attachments) {
				addText(attachmentList, 'span', attachment.name, 'message-attachment');
			}
			body.append(attachmentList);
		}
		if (message.provider) {
			const attribution = message.contributors?.length
				? `Combined from ${message.contributors.map(item => `${item.provider} · ${item.model}`).join(' and ')}`
				: `${message.provider} · ${message.model}`;
			addText(body, 'div', attribution, 'message-meta');
		}
		if (message.reviewStatus === 'reviewed' && message.reviewedBy) {
			addText(body, 'div', `Reviewed and revised by ${message.reviewedBy.provider} · ${message.reviewedBy.model}`, 'message-meta review-meta');
		} else if (message.reviewStatus === 'unavailable') {
			addText(body, 'div', `Second-model review unavailable; original draft kept. ${message.reviewError || ''}`, 'message-meta review-meta review-warning');
		}
		if (message.websiteHtml) {
			const draft = document.createElement('div');
			draft.className = 'website-draft-card';
			addText(draft, 'span', 'Website draft ready', 'website-draft-label');
			const review = document.createElement('button');
			review.type = 'button';
			review.className = 'button button-secondary';
			review.textContent = message.publishedUrl ? 'View publish details' : 'Review website';
			review.addEventListener('click', () => openWebsiteReview(message));
			draft.append(review);
			if (message.publishedUrl) {
				const link = document.createElement('a');
				link.href = message.publishedUrl;
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				link.textContent = 'Open public website ↗';
				draft.append(link);
			}
			body.append(draft);
		}
		item.append(body);
		elements.messageList.append(item);
	}
	elements.messageList.scrollTop = elements.messageList.scrollHeight;
}

function renderWorkspace() {
	if (!workspace.projects.some(project => project.id === workspace.selectedProjectId)) workspace.selectedProjectId = null;
	if (!workspace.chats.some(chat => chat.id === workspace.selectedChatId)) workspace.selectedChatId = null;
	const chat = activeChat();
	if (workspace.selectedProjectId && chat?.projectId !== workspace.selectedProjectId) {
		const latest = workspace.chats
			.filter(candidate => candidate.projectId === workspace.selectedProjectId)
			.sort((left, right) => right.updatedAt - left.updatedAt)[0];
		workspace.selectedChatId = latest?.id || null;
	}
	renderProjects();
	renderChats();
	renderModels();
	renderMessages();
	const selectedChat = activeChat();
	elements.chatTitle.textContent = selectedChat?.title || 'New chat';
	elements.activeProjectLabel.textContent = selectedChat?.projectId
		? (workspace.projects.find(project => project.id === selectedChat.projectId)?.name || 'PROJECT')
		: 'PERSONAL WORKSPACE';
}

function createChat() {
	const chat = {
		id: newId(),
		title: 'New chat',
		projectId: workspace.selectedProjectId,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		messages: []
	};
	workspace.chats.push(chat);
	workspace.selectedChatId = chat.id;
	persistWorkspace();
	renderWorkspace();
	elements.prompt.focus();
}

function createProject() {
	const name = window.prompt('Name your project');
	if (!name || !name.trim()) return;
	const project = { id: newId(), name: name.trim().slice(0, 60), createdAt: Date.now() };
	workspace.projects.push(project);
	workspace.selectedProjectId = project.id;
	createChat();
}

function renameProject(project) {
	const name = window.prompt('Rename project', project.name);
	if (!name || !name.trim()) return;
	project.name = name.trim().slice(0, 60);
	persistWorkspace();
	renderWorkspace();
}

function displaySettings() {
	elements.conversationView.hidden = true;
	elements.settingsView.hidden = false;
	elements.websiteReviewView.hidden = true;
	elements.hostingView.hidden = true;
	renderProviderSettings();
}

function displayChat() {
	elements.settingsView.hidden = true;
	elements.conversationView.hidden = false;
	elements.websiteReviewView.hidden = true;
	elements.hostingView.hidden = true;
}

async function displayHosting() {
	elements.conversationView.hidden = true;
	elements.settingsView.hidden = true;
	elements.websiteReviewView.hidden = true;
	elements.hostingView.hidden = false;
	if (!elements.vercelProjectName.value && activeWebsiteDraft?.websiteTitle) {
		elements.vercelProjectName.value = activeWebsiteDraft.websiteTitle;
	}
	await refreshVercelStatus();
}

let activeWebsiteDraft = null;

async function openWebsiteReview(draft) {
	activeWebsiteDraft = draft;
	elements.conversationView.hidden = true;
	elements.settingsView.hidden = true;
	elements.hostingView.hidden = true;
	elements.websiteReviewView.hidden = false;
	elements.websiteTitle.value = draft.websiteTitle || 'My website';
	elements.websiteHtml.value = draft.websiteHtml;
	elements.publishStatus.replaceChildren();
	elements.publishStatus.className = 'publish-status';
	elements.websiteReviewStatus.className = 'review-status';
	elements.websiteReviewStatus.textContent = draft.reviewStatus === 'reviewed'
		? `Second-model review complete · ${draft.reviewedBy.provider} · ${draft.reviewedBy.model}`
		: `Second-model review unavailable; the original draft is shown. ${draft.reviewError || ''}`;
	updateWebsitePreview();
	elements.githubStatus.textContent = 'Checking your GitHub connection…';
	try {
		const status = await api('/api/github/status');
		elements.githubStatus.textContent = status.connected
			? `GitHub connected as @${status.username}. Publishing will create a public repository and website.`
			: `${status.message} To connect once, double-click Connect Noah Tool AI to GitHub.bat in the project folder.`;
	} catch (error) {
		elements.githubStatus.textContent = error.message;
	}
}

async function refreshVercelStatus() {
	elements.vercelStatus.classList.remove('error');
	elements.vercelStatus.textContent = 'Checking Vercel connection…';
	try {
		const status = await api('/api/vercel/status');
		elements.vercelStatus.textContent = status.connected
			? `Connected to Vercel as ${status.username}.`
			: status.message || 'Vercel is not connected yet.';
		if (!status.connected && status.message?.includes('token check failed')) elements.vercelStatus.classList.add('error');
	} catch (error) {
		elements.vercelStatus.textContent = error.message;
		elements.vercelStatus.classList.add('error');
	}
}

async function connectVercel() {
	if (!elements.vercelToken.value.trim()) {
		elements.vercelStatus.textContent = 'Enter a Vercel access token to connect or update the account.';
		elements.vercelStatus.classList.add('error');
		elements.vercelToken.focus();
		return;
	}
	elements.saveVercelToken.disabled = true;
	elements.vercelStatus.classList.remove('error');
	elements.vercelStatus.textContent = 'Checking token with Vercel…';
	try {
		const status = await api('/api/vercel/token', {
			method: 'PUT',
			body: JSON.stringify({ token: elements.vercelToken.value })
		});
		elements.vercelToken.value = '';
		elements.vercelStatus.textContent = status.connected
			? `Connected to Vercel as ${status.username}.`
			: 'Vercel token removed.';
		showToast(status.connected ? 'Vercel connected' : 'Vercel disconnected');
	} catch (error) {
		elements.vercelStatus.textContent = error.message;
		elements.vercelStatus.classList.add('error');
		showToast('Could not connect Vercel', true);
	} finally {
		elements.saveVercelToken.disabled = false;
	}
}

function chooseProjectFiles(fileList) {
	selectedProjectFiles = [];
	elements.projectFolderStatus.classList.remove('error');
	elements.projectFolderStatus.textContent = 'No project folder selected. You can also deploy the generated website open in Review website.';
	const selected = [...fileList];
	if (selected.length > 150) {
		elements.projectFolderStatus.classList.add('error');
		elements.projectFolderStatus.textContent = 'Choose a project folder with 150 files or fewer.';
		showToast(elements.projectFolderStatus.textContent, true);
		return;
	}
	const excludedParts = new Set(['node_modules', '.git', '.next', '.vercel']);
	const skipped = [];
	const accepted = [];
	let totalBytes = 0;
	for (const file of selected) {
		const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
		const segments = path.split('/');
		const relative = segments.length > 1 ? segments.slice(1).join('/') : path;
		const lowerParts = relative.toLowerCase().split('/');
		const basename = lowerParts.at(-1) || '';
		if (lowerParts.some(part => excludedParts.has(part))
			|| /^\.env(?:\.|$)/i.test(basename)
			|| /^(?:\.npmrc|\.yarnrc|id_rsa.*|credentials(?:\.json)?|\.local-credentials\.json)$/i.test(basename)
			|| /\.(?:pem|key)$/i.test(basename)) {
			skipped.push(file.name);
			continue;
		}
		if (!relative || relative.length > 500 || relative.split('/').some(part => !part || part === '.' || part === '..')) {
			elements.projectFolderStatus.classList.add('error');
			elements.projectFolderStatus.textContent = `${file.name}: this project path is invalid.`;
			showToast(elements.projectFolderStatus.textContent, true);
			return;
		}
		if (file.size > 4 * 1024 * 1024) {
			elements.projectFolderStatus.classList.add('error');
			elements.projectFolderStatus.textContent = `${file.name}: files must be 4 MB or smaller.`;
			showToast(elements.projectFolderStatus.textContent, true);
			return;
		}
		totalBytes += file.size;
		if (totalBytes > 8 * 1024 * 1024) {
			elements.projectFolderStatus.classList.add('error');
			elements.projectFolderStatus.textContent = 'Project folder must be 8 MB or smaller. Remove large assets and try again.';
			showToast(elements.projectFolderStatus.textContent, true);
			return;
		}
		accepted.push({ file, path: relative });
	}
	if (!accepted.length) {
		elements.projectFolderStatus.classList.add('error');
		elements.projectFolderStatus.textContent = 'No deployable project files found in that folder.';
		showToast(elements.projectFolderStatus.textContent, true);
		return;
	}
	selectedProjectFiles = accepted;
	elements.projectFolderStatus.classList.remove('error');
	elements.projectFolderStatus.textContent = `${accepted.length} files selected · ${(totalBytes / (1024 * 1024)).toFixed(1)} MB${skipped.length ? ` · excluded ${skipped.length} secret/cache files` : ''}. Build configuration will be auto-detected by Vercel.`;
	if (!elements.vercelProjectName.value.trim()) {
		const rootName = (accepted[0].file.webkitRelativePath || accepted[0].file.name).split(/[\\/]/)[0];
		elements.vercelProjectName.value = rootName || '';
	}
}

function fileAsBase64(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener('load', () => resolve(String(reader.result).split(',')[1]));
		reader.addEventListener('error', () => reject(new Error(`Could not read ${file.name}.`)));
		reader.readAsDataURL(file);
	});
}

async function deployOnVercel() {
	const name = elements.vercelProjectName.value.trim();
	const customDomain = elements.vercelDomain.value.trim();
	let files;
	if (selectedProjectFiles.length) {
		files = [];
		for (const item of selectedProjectFiles) files.push({ path: item.path, data: await fileAsBase64(item.file) });
	} else if (activeWebsiteDraft?.websiteHtml) {
		files = [{
			path: 'index.html',
			data: btoa(unescape(encodeURIComponent(activeWebsiteDraft.websiteHtml)))
		}];
	} else {
		throw new Error('Choose a project folder or open a generated website from Review website first.');
	}
	return api('/api/vercel/deploy', {
		method: 'POST',
		body: JSON.stringify({ name, customDomain, files })
	});
}

async function publishToVercel() {
	if (!elements.vercelProjectName.value.trim()) {
		elements.vercelProjectName.focus();
		elements.vercelDeployStatus.textContent = 'Enter a website or project name.';
		elements.vercelDeployStatus.classList.add('error');
		return;
	}
	const source = selectedProjectFiles.length
		? `${selectedProjectFiles.length} project files`
		: activeWebsiteDraft?.websiteHtml ? 'the generated website currently open in Review website' : '';
	if (!source) {
		elements.vercelDeployStatus.textContent = 'Choose a project folder or open a generated website from Review website first.';
		elements.vercelDeployStatus.classList.add('error');
		return;
	}
	const name = elements.vercelProjectName.value.trim();
	if (!window.confirm(`Deploy ${source} as "${name}" to Vercel? The resulting site will be public. Project source will be sent to Vercel, which may run its build scripts.`)) return;
	elements.deployVercel.disabled = true;
	elements.vercelDeployStatus.classList.remove('error');
	elements.vercelDeployStatus.textContent = 'Uploading source and starting the Vercel production build…';
	try {
		const result = await deployOnVercel();
		elements.vercelDeployStatus.replaceChildren();
		const link = document.createElement('a');
		link.href = result.url;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		link.textContent = result.url;
		elements.vercelDeployStatus.append(document.createTextNode(`Deployment started (${result.status}). `), link);
		if (result.customDomain) {
			elements.vercelDeployStatus.append(document.createTextNode(result.customDomain.verified
				? ` · ${result.customDomain.domain} is verified.`
				: ` · Add the requested DNS records to verify ${result.customDomain.domain}.`));
			for (const record of result.customDomain.verification) {
				elements.vercelDeployStatus.append(document.createElement('br'));
				elements.vercelDeployStatus.append(document.createTextNode(`${record.type} ${record.domain}: ${record.value} (${record.reason})`));
			}
		} else if (result.customDomainError) {
			elements.vercelDeployStatus.append(document.createTextNode(` · Deployment succeeded but custom domain setup failed: ${result.customDomainError}`));
		}
		showToast('Vercel deployment started');
	} catch (error) {
		elements.vercelDeployStatus.textContent = error.message;
		elements.vercelDeployStatus.classList.add('error');
		showToast('Vercel deployment failed', true);
	} finally {
		elements.deployVercel.disabled = false;
	}
}

function updateWebsitePreview() {
	if (!activeWebsiteDraft) return;
	activeWebsiteDraft.websiteTitle = elements.websiteTitle.value.trim() || 'My website';
	activeWebsiteDraft.websiteHtml = elements.websiteHtml.value;
	elements.websitePreview.src = `data:text/html;charset=utf-8,${encodeURIComponent(activeWebsiteDraft.websiteHtml)}`;
	persistWorkspace();
}

async function publishActiveWebsite() {
	if (!activeWebsiteDraft) return;
	updateWebsitePreview();
	if (!window.confirm(`Publish "${activeWebsiteDraft.websiteTitle}" publicly? Its website files and source will be visible to anyone.`)) return;
	elements.websitePublish.disabled = true;
	elements.publishStatus.className = 'publish-status';
	elements.publishStatus.textContent = 'Creating a public GitHub repository and starting the website deployment…';
	try {
		const result = await api('/api/website/publish', {
			method: 'POST',
			body: JSON.stringify({ title: activeWebsiteDraft.websiteTitle, html: activeWebsiteDraft.websiteHtml })
		});
		activeWebsiteDraft.publishedUrl = result.url;
		activeWebsiteDraft.repositoryUrl = result.repositoryUrl;
		persistWorkspace();
		showToast('Your public website link is ready');
		elements.publishStatus.replaceChildren();
		elements.publishStatus.append(document.createTextNode('Publishing started. GitHub Pages can take a few minutes to make the link live. '));
		const link = document.createElement('a');
		link.href = result.url;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		link.textContent = result.url;
		elements.publishStatus.append(link);
		const repo = document.createElement('a');
		repo.href = result.repositoryUrl;
		repo.target = '_blank';
		repo.rel = 'noopener noreferrer';
		repo.textContent = ' · View public source repository';
		elements.publishStatus.append(repo);
	} catch (error) {
		elements.publishStatus.className = 'publish-status error';
		elements.publishStatus.textContent = error.message;
	} finally {
		elements.publishStatus.classList.remove('pending');
		elements.websitePublish.disabled = false;
	}
}

function renderProviderSettings() {
	elements.providerList.replaceChildren();
	elements.providerCount.textContent = `${Object.values(settings).filter(value => value.connected).length} ready`;
	for (const provider of catalog.providers) {
		const choice = document.createElement('button');
		choice.type = 'button';
		choice.className = `provider-choice${elements.selectedProvider === provider.name ? ' active' : ''}`;
		const nameBlock = document.createElement('span');
		addText(nameBlock, 'span', `${provider.flag}  ${provider.name}`, 'provider-choice-name');
		addText(nameBlock, 'span', provider.models.filter(model => model.id).length + ' models listed', 'provider-choice-meta');
		const providerSettings = settings[provider.name];
		const count = providerSettings?.keyCount || 0;
		const badge = count ? `${count} key${count === 1 ? '' : 's'}` : providerSettings?.anonymous ? 'Free · no key' : 'Add key';
		addText(choice, 'span', badge, 'provider-badge');
		choice.prepend(nameBlock);
		choice.addEventListener('click', () => selectProvider(provider));
		elements.providerList.append(choice);
	}
}

function selectProvider(provider) {
	elements.selectedProvider = provider.name;
	elements.providerFormTitle.textContent = provider.name;
	elements.providerDescription.textContent = provider.description;
	elements.baseUrl.value = settings[provider.name]?.baseUrl || providerDefaultUrl(provider);
	elements.apiKeys.value = '';
	elements.connectionStatus.className = 'connection-status';
	const count = settings[provider.name]?.keyCount || 0;
	const anonymous = settings[provider.name]?.anonymous;
	elements.connectionStatus.textContent = count
		? `${count} key${count === 1 ? '' : 's'} configured. Add new key(s) below or remove the current pool.`
		: anonymous
			? 'Ready to use anonymously — no API key or signup needed.'
			: 'Not connected yet. Add an API key to connect.';
	elements.keyHelp.textContent = anonymous
		? 'This provider has a no-key free tier. Leave this blank to continue using it anonymously, or add your own optional key.'
		: 'Enter one or more keys for this provider, one per line. Keys are provider-specific, appended to its local rotation pool, and cannot be viewed here after saving.';
	elements.saveProvider.textContent = anonymous && !count ? 'Use free access' : 'Save provider';
	elements.removeProvider.hidden = !count;
	elements.saveProvider.disabled = false;
	renderProviderSettings();
}

async function saveProvider(event) {
	event.preventDefault();
	if (!elements.selectedProvider) return;
	elements.saveProvider.disabled = true;
	elements.connectionStatus.className = 'connection-status';
	elements.connectionStatus.textContent = 'Saving locally…';
	try {
		settings = await api('/api/settings', {
			method: 'PUT',
			body: JSON.stringify({
				provider: elements.selectedProvider,
				baseUrl: elements.baseUrl.value.trim(),
				apiKeys: elements.apiKeys.value
			})
		});
		elements.apiKeys.value = '';
		const updated = settings[elements.selectedProvider];
		elements.connectionStatus.textContent = updated.keyCount
			? `${updated.keyCount} key(s) saved in the local rotation pool.`
			: 'Free anonymous access is enabled.';
		renderProviderSettings();
		renderModels();
	} catch (error) {
		elements.connectionStatus.className = 'connection-status error';
		elements.connectionStatus.textContent = error.message;
	} finally {
		elements.saveProvider.disabled = false;
	}
}

async function removeProvider() {
	if (!elements.selectedProvider || !window.confirm(`Remove all stored keys for ${elements.selectedProvider}?`)) return;
	elements.removeProvider.disabled = true;
	try {
		settings = await api(`/api/settings?provider=${encodeURIComponent(elements.selectedProvider)}`, { method: 'DELETE' });
		elements.connectionStatus.className = 'connection-status';
		elements.connectionStatus.textContent = 'All keys removed from this device.';
		elements.removeProvider.hidden = true;
		renderProviderSettings();
		renderModels();
	} catch (error) {
		elements.connectionStatus.className = 'connection-status error';
		elements.connectionStatus.textContent = error.message;
	} finally {
		elements.removeProvider.disabled = false;
	}
}

function resizePrompt() {
	elements.prompt.style.height = 'auto';
	elements.prompt.style.height = `${Math.min(elements.prompt.scrollHeight, 180)}px`;
}

function renderPendingAttachments() {
	elements.pendingAttachments.replaceChildren();
	for (const [index, file] of pendingFiles.entries()) {
		const kind = getFileKind(file);
		const item = document.createElement('div');
		item.className = 'pending-attachment';
		item.title = file.name;
		addText(item, 'span', kind === 'image' ? '▧' : kind === 'video' ? '▶' : kind === 'audio' ? '♪' : '▤', 'attachment-icon');
		addText(item, 'span', `${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB`, 'attachment-name');
		const remove = document.createElement('button');
		remove.type = 'button';
		remove.className = 'remove-attachment';
		remove.setAttribute('aria-label', `Remove ${file.name}`);
		remove.textContent = '×';
		remove.addEventListener('click', () => {
			pendingFiles.splice(index, 1);
			renderPendingAttachments();
		});
		item.append(remove);
		elements.pendingAttachments.append(item);
	}
}

function getFileKind(file) {
	if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name)) return 'image';
	if (file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name)) return 'video';
	if (file.type.startsWith('audio/') || /\.(mp3|wav)$/i.test(file.name)) return 'audio';
	return 'text';
}

function addFiles(fileList) {
	const selected = [...fileList];
	if (pendingFiles.length + selected.length > 5) {
		showToast('Attach up to 5 files per message.', true);
		return;
	}
	const supportedTextExtensions = /\.(txt|md|csv|json|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|go|rs|sql|xml|ya?ml|toml|log)$/i;
	for (const file of selected) {
		const kind = getFileKind(file);
		const supported = kind === 'image' || kind === 'video'
			|| (kind === 'audio' && (/\.(mp3|wav)$/i.test(file.name) || ['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(file.type)))
			|| file.type.startsWith('text/') || supportedTextExtensions.test(file.name);
		if (!supported) {
			showToast(`${file.name}: attach an image, video, MP3/WAV audio, or text/code file. PDFs and office documents aren't supported yet.`, true);
			continue;
		}
		if (kind === 'image' && file.size > 20 * 1024 * 1024) {
			showToast(`${file.name}: images must be 20 MB or smaller.`, true);
			continue;
		}
		if (kind === 'video' && file.size > 100 * 1024 * 1024) {
			showToast(`${file.name}: videos must be 100 MB or smaller.`, true);
			continue;
		}
		if (kind === 'audio' && file.size > 16 * 1024 * 1024) {
			showToast(`${file.name}: MP3/WAV audio files must be 16 MB or smaller.`, true);
			continue;
		}
		if ((file.type.startsWith('text/') || supportedTextExtensions.test(file.name)) && file.size > 500 * 1024) {
			showToast(`${file.name}: text/code files must be 500 KB or smaller.`, true);
			continue;
		}
		pendingFiles.push(file);
	}
	renderPendingAttachments();
}

function canvasImageData(canvas, quality = 0.8) {
	return canvas.toDataURL('image/jpeg', quality);
}

function readAsDataUrl(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener('load', () => resolve(reader.result));
		reader.addEventListener('error', () => reject(new Error(`Could not read ${file.name}.`)));
		reader.readAsDataURL(file);
	});
}

async function prepareImage(file) {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	return { kind: 'image', name: file.name, data: canvasImageData(canvas) };
}

function waitForMedia(media, eventName) {
	return new Promise((resolve, reject) => {
		const onEvent = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(new Error('The browser could not read this video format.'));
		};
		const cleanup = () => {
			media.removeEventListener(eventName, onEvent);
			media.removeEventListener('error', onError);
		};
		media.addEventListener(eventName, onEvent, { once: true });
		media.addEventListener('error', onError, { once: true });
	});
}

async function prepareVideo(file) {
	const url = URL.createObjectURL(file);
	const video = document.createElement('video');
	video.muted = true;
	video.playsInline = true;
	video.preload = 'metadata';
	try {
		const loaded = waitForMedia(video, 'loadedmetadata');
		video.src = url;
		await loaded;
		if (video.readyState < 2) await waitForMedia(video, 'loadeddata');
		if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('This video has no readable duration.');
		const frameCount = Math.min(4, Math.max(1, Math.ceil(video.duration)));
		const times = Array.from({ length: frameCount }, (_, index) => frameCount === 1
			? Math.min(video.duration / 2, 0.1)
			: Math.min(video.duration - 0.05, index * video.duration / (frameCount - 1)));
		const canvas = document.createElement('canvas');
		const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
		canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
		canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
		const context = canvas.getContext('2d');
		const frames = [];
		for (const time of times) {
			if (video.currentTime !== time) {
				const seeked = waitForMedia(video, 'seeked');
				video.currentTime = time;
				await seeked;
			}
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
			frames.push({ time, data: canvasImageData(canvas, 0.72) });
		}
		return { kind: 'video', name: file.name, duration: video.duration, frames };
	} finally {
		video.pause();
		video.removeAttribute('src');
		URL.revokeObjectURL(url);
	}
}

async function prepareAttachments(files) {
	const attachments = [];
	for (const file of files) {
		const kind = getFileKind(file);
		if (kind === 'image') {
			attachments.push(await prepareImage(file));
		} else if (kind === 'video') {
			attachments.push(await prepareVideo(file));
		} else if (kind === 'audio') {
			const format = /\.wav$/i.test(file.name) || ['audio/wav', 'audio/x-wav'].includes(file.type) ? 'wav' : 'mp3';
			let data = await readAsDataUrl(file);
			data = data.replace(/^data:[^;]+;base64,/, `data:audio/${format === 'wav' ? 'wav' : 'mpeg'};base64,`);
			attachments.push({ kind: 'audio', name: file.name, format, data });
		} else {
			attachments.push({ kind: 'text', name: file.name, text: await file.text() });
		}
	}
	return attachments;
}

function shouldCreateWebsite(prompt) {
	const text = prompt.toLowerCase();
	const mentionsWebsite = /\b(website|web site|webpage|web page|landing page|site)\b/.test(text);
	const asksForBuild = /\b(make|build|create|design|generate|develop|launch)\b/.test(text);
	const asksForInstructions = /\b(how do i|how can i|how to|teach me|explain|tutorial|ideas for)\b/.test(text);
	const negatesBuild = /\b(?:don't|do not|never)\s+(?:make|build|create|design|generate|develop|launch)\b/.test(text);
	return mentionsWebsite && asksForBuild && !asksForInstructions && !negatesBuild;
}

async function sendMessage(event) {
	event.preventDefault();
	const prompt = elements.prompt.value.trim();
	const files = [...pendingFiles];
	if ((!prompt && !files.length) || elements.sendButton.disabled) return;
	const userPrompt = prompt || 'Please review and analyze the attached file(s).';
	const mode = workspace.mode === 'auto' && shouldCreateWebsite(prompt) ? 'website' : workspace.mode;
	let chat = activeChat();
	if (!chat) {
		createChat();
		chat = activeChat();
	}
	chat.messages.push({
		role: 'user',
		content: userPrompt,
		attachments: files.map(file => ({ name: file.name, type: file.type, size: file.size }))
	});
	if (chat.title === 'New chat') chat.title = userPrompt.slice(0, 42) + (userPrompt.length > 42 ? '…' : '');
	chat.updatedAt = Date.now();
	elements.prompt.value = '';
	resizePrompt();
	persistWorkspace();
	renderWorkspace();

	const waiting = {
		role: 'assistant',
		content: mode === 'website' ? 'Building your website…' : 'Working on your request…',
		pending: true
	};
	if (mode === 'website') activeWebsiteDraft = null;
	chat.messages.push(waiting);
	renderMessages();
	elements.sendButton.disabled = true;
	elements.modeSelect.disabled = true;
	elements.modelSelect.disabled = true;
	try {
		const model = mode === 'auto' || mode === 'compare' ? 'auto' : workspace.selectedModel;
		const attachments = await prepareAttachments(files);
		const result = await api(mode === 'website' ? '/api/website/generate' : '/api/chat', {
			method: 'POST',
			body: JSON.stringify({
				messages: chat.messages.filter(message => !message.pending && !message.websiteHtml).slice(-20).map(({ role, content }) => ({ role, content })),
				prompt: userPrompt,
				mode,
				model,
				attachments
			})
		});
		const responseMessage = mode === 'website'
			? { role: 'assistant', content: 'Your website draft is ready. Review the preview before publishing it publicly.', provider: result.provider, model: result.model, websiteHtml: result.html, websiteTitle: result.title, reviewStatus: result.reviewStatus, reviewedBy: result.reviewedBy, reviewError: result.reviewError }
			: { role: 'assistant', content: result.content, provider: result.provider, model: result.model, contributors: result.contributors, reviewStatus: result.reviewStatus, reviewedBy: result.reviewedBy, reviewError: result.reviewError };
		chat.messages.splice(chat.messages.indexOf(waiting), 1, responseMessage);
		pendingFiles = pendingFiles.filter(file => !files.includes(file));
		renderPendingAttachments();
		if (mode === 'website') activeWebsiteDraft = responseMessage;
		showToast(mode === 'website' ? 'Website draft ready to review' : 'Response ready');
	} catch (error) {
		chat.messages.splice(chat.messages.indexOf(waiting), 1, { role: 'assistant', content: error.message, error: true });
		showToast('No response yet — check the message for details', true);
		if (files.length) {
			elements.prompt.value = prompt;
			showToast(`Attachment processing or provider request failed: ${error.message}`, true);
		}
	}
	chat.updatedAt = Date.now();
	persistWorkspace();
	renderWorkspace();
	if (mode === 'website' && activeWebsiteDraft) openWebsiteReview(activeWebsiteDraft);
	elements.sendButton.disabled = false;
	elements.modeSelect.disabled = false;
	elements.modelSelect.disabled = false;
	elements.prompt.focus();
}

function wireEvents() {
	elements.newChat.addEventListener('click', createChat);
	elements.newProject.addEventListener('click', createProject);
	elements.settingsButton.addEventListener('click', displaySettings);
	elements.hostingButton.addEventListener('click', displayHosting);
	elements.hostingBack.addEventListener('click', displayChat);
	elements.saveVercelToken.addEventListener('click', connectVercel);
	elements.chooseProjectFolder.addEventListener('click', () => elements.projectFolderInput.click());
	elements.projectFolderInput.addEventListener('change', () => {
		chooseProjectFiles(elements.projectFolderInput.files);
		elements.projectFolderInput.value = '';
	});
	elements.deployVercel.addEventListener('click', publishToVercel);
	elements.backToChat.addEventListener('click', displayChat);
	elements.websiteCancel.addEventListener('click', displayChat);
	elements.websiteUpdatePreview.addEventListener('click', updateWebsitePreview);
	elements.websitePublish.addEventListener('click', publishActiveWebsite);
	elements.providerForm.addEventListener('submit', saveProvider);
	elements.removeProvider.addEventListener('click', removeProvider);
	elements.composer.addEventListener('submit', sendMessage);
	elements.attachButton.addEventListener('click', () => elements.fileInput.click());
	elements.fileInput.addEventListener('change', () => {
		addFiles(elements.fileInput.files);
		elements.fileInput.value = '';
	});
	elements.composer.addEventListener('dragover', event => {
		if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
	});
	elements.composer.addEventListener('drop', event => {
		if (!event.dataTransfer?.files.length) return;
		event.preventDefault();
		addFiles(event.dataTransfer.files);
	});
	elements.prompt.addEventListener('paste', event => {
		const images = [...(event.clipboardData?.items || [])]
			.filter(item => item.type.startsWith('image/'))
			.map(item => item.getAsFile())
			.filter(Boolean);
		if (images.length) addFiles(images);
	});
	elements.prompt.addEventListener('input', resizePrompt);
	elements.prompt.addEventListener('keydown', event => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			elements.composer.requestSubmit();
		}
	});
	elements.modelSelect.addEventListener('change', () => {
		workspace.selectedModel = elements.modelSelect.value;
		persistWorkspace();
	});
	elements.modeSelect.addEventListener('change', () => {
		workspace.mode = elements.modeSelect.value;
		if (workspace.mode === 'selected' && workspace.selectedModel === 'auto') {
			workspace.mode = 'auto';
			elements.modeSelect.value = 'auto';
		}
		persistWorkspace();
		const placeholders = {
			website: 'Describe the website you want, including its purpose, style, sections, and colors…',
			design: 'Describe what you want designed or improved, and who it is for…',
			dify: 'Describe the AI app or workflow you want to design…',
			browser: 'Describe the browser task and which steps need confirmation…',
			comfyui: 'Describe the image, video, or visual workflow you want to create…',
			investigation: 'Describe the question and share source links or excerpts to analyze…',
			explainability: 'Describe your PyTorch vision model and the prediction you want to explain…',
			objectron: 'Describe the 3D object-vision task, dataset inputs, and desired output…',
			cad: 'Describe the 3D scene or CAD changes you want to make…',
			animation: 'Describe the animation or motion effect you want to build…',
			video: 'Describe the video you want to create and its style…',
			presentation: 'Describe the presentation topic, audience, and goal…',
			voice: 'Describe the voice, audio, or speech tool you want to build…'
		};
		elements.prompt.placeholder = placeholders[workspace.mode] || 'Message Noah Tool AI…';
	});
}

async function init() {
	wireEvents();
	if (workspaceLoadError) {
		elements.workspaceStatus.textContent = workspaceLoadError;
		elements.workspaceStatus.hidden = false;
	}
	try {
		[catalog, settings] = await Promise.all([api('/api/catalog'), api('/api/settings')]);
		renderWorkspace();
		if (workspace.chats.length === 0 && !workspaceLoadError) createChat();
	} catch (error) {
		elements.composerHint.textContent = `Could not connect to the local app: ${error.message}`;
		elements.sendButton.disabled = true;
	}
}

init();
